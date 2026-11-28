import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { PAPER_PRESETS, type TransformSettings } from './presets';

export interface VectorExportProgress {
  currentPage: number;
  totalPages: number;
  stage: 'transforming' | 'saving';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fmtNum(v: number): string {
  const clamped = clamp01(v);
  const rounded = Math.round(clamped * 10000) / 10000;
  return String(rounded);
}

/**
 * Remaps an RGB color in [0, 1] space using the same eye-comfort logic as the live reader:
 * - White backgrounds & boxes -> target paper/dark background
 * - Black/dark-grey text & lines -> crisp target ink
 * - Colored links, headings & vector charts -> natural hue preserved (never inverted), lifted for dark-mode legibility
 */
function remapRgbUnit(
  r: number,
  g: number,
  b: number,
  settings: TransformSettings
): [number, number, number] {
  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const paperR = preset.paperRgb.r / 255;
  const paperG = preset.paperRgb.g / 255;
  const paperB = preset.paperRgb.b / 255;

  const softenFactor = settings.inkSoftness * (preset.isDark ? 0.1 : 0.14);
  const inkR = preset.inkRgb.r / 255 + (paperR - preset.inkRgb.r / 255) * softenFactor;
  const inkG = preset.inkRgb.g / 255 + (paperG - preset.inkRgb.g / 255) * softenFactor;
  const inkB = preset.inkRgb.b / 255 + (paperB - preset.inkRgb.b / 255) * softenFactor;

  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const chroma = maxC - minC;

  let outR: number;
  let outG: number;
  let outB: number;

  if (preset.isDark) {
    const inkAmount = 1 - lum;
    if (inkAmount < 0.025) {
      outR = paperR;
      outG = paperG;
      outB = paperB;
    } else {
      const crisp = Math.pow(inkAmount, 0.86);
      outR = paperR + (inkR - paperR) * crisp;
      outG = paperG + (inkG - paperG) * crisp;
      outB = paperB + (inkB - paperB) * crisp;
    }
  } else {
    outR = inkR + (paperR - inkR) * lum;
    outG = inkG + (paperG - inkG) * lum;
    outB = inkB + (paperB - inkB) * lum;
  }

  if (settings.preserveColors && chroma > 0.055) {
    const sat = maxC > 0 ? chroma / maxC : 0;

    if (preset.isDark) {
      if (lum > 0.84 && sat < 0.22) {
        // Pale tinted callout box -> elevated dark card
        const tint = 0.22;
        outR = paperR + 0.05 + (r - 0.86) * tint;
        outG = paperG + 0.052 + (g - 0.86) * tint;
        outB = paperB + 0.06 + (b - 0.86) * tint;
      } else {
        const colorWeight = Math.min(1, sat * 1.4) * Math.min(1, (chroma - 0.055) / 0.14);
        const minReadableLum = 0.44;
        let lift = 1;
        if (lum < minReadableLum && lum > 0.03) {
          lift = Math.min(2.1, (minReadableLum + (minReadableLum - lum) * 0.25) / lum);
        } else if (lum > 0.78) {
          lift = 0.88;
        }
        const natR = Math.min(0.95, r * lift);
        const natG = Math.min(0.95, g * lift);
        const natB = Math.min(0.95, b * lift);

        outR = outR + (natR - outR) * colorWeight;
        outG = outG + (natG - outG) * colorWeight;
        outB = outB + (natB - outB) * colorWeight;
      }
    } else {
      const colorWeight = Math.min(1, sat * 1.35) * Math.min(1, (chroma - 0.055) / 0.15);
      const multR = r * paperR;
      const multG = g * paperG;
      const multB = b * paperB;

      outR = outR + (multR - outR) * colorWeight;
      outG = outG + (multG - outG) * colorWeight;
      outB = outB + (multB - outB) * colorWeight;
    }
  }

  return [clamp01(outR), clamp01(outG), clamp01(outB)];
}

function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

interface Token {
  type: 'number' | 'operator' | 'other';
  raw: string;
  num?: number;
}

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

function isWhitespace(code: number): boolean {
  return (
    code === 0x00 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x20
  );
}

function isDelimiter(code: number): boolean {
  return (
    code === 0x28 || // (
    code === 0x29 || // )
    code === 0x3c || // <
    code === 0x3e || // >
    code === 0x5b || // [
    code === 0x5d || // ]
    code === 0x7b || // {
    code === 0x7d || // }
    code === 0x2f || // /
    code === 0x25 // %
  );
}

/**
 * Tokenizes a PDF content stream safely while preserving string literals,
 * hex strings, arrays, dictionaries, comments, and inline image binary payloads verbatim.
 */
function rewriteContentStreamBytes(
  inputBytes: Uint8Array,
  settings: TransformSettings
): Uint8Array {
  // Decode as Latin-1 (1 byte -> 1 char code) so arbitrary binary data survives lossless round-trip
  let src = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < inputBytes.length; i += CHUNK) {
    src += String.fromCharCode(...inputBytes.subarray(i, i + CHUNK));
  }

  const len = src.length;
  let pos = 0;
  const outParts: string[] = [];
  const recentTokens: Token[] = [];

  function flushRecent() {
    for (const t of recentTokens) {
      outParts.push(t.raw);
    }
    recentTokens.length = 0;
  }

  function pushToken(token: Token) {
    recentTokens.push(token);
    if (recentTokens.length > 8) {
      const oldest = recentTokens.shift()!;
      outParts.push(oldest.raw);
    }
  }

  function getTrailingNumbers(count: number): number[] | null {
    // Find the last `count` non-whitespace tokens in recentTokens (before current operator)
    const nums: number[] = [];
    for (let i = recentTokens.length - 1; i >= 0 && nums.length < count; i--) {
      const t = recentTokens[i];
      if (t.type === 'other' && t.raw.trim() === '') continue;
      if (t.type === 'number' && t.num !== undefined) {
        nums.unshift(t.num);
      } else {
        return null;
      }
    }
    return nums.length === count ? nums : null;
  }

  function popTrailingNumbers(count: number): void {
    let popped = 0;
    while (recentTokens.length > 0 && popped < count) {
      const t = recentTokens.pop()!;
      if (t.type === 'number') {
        popped++;
      }
    }
  }

  while (pos < len) {
    const ch = src.charCodeAt(pos);

    // Whitespace
    if (isWhitespace(ch)) {
      const start = pos;
      while (pos < len && isWhitespace(src.charCodeAt(pos))) pos++;
      pushToken({ type: 'other', raw: src.slice(start, pos) });
      continue;
    }

    // Comment %...
    if (ch === 0x25) {
      const start = pos;
      while (pos < len && src.charCodeAt(pos) !== 0x0a && src.charCodeAt(pos) !== 0x0d) {
        pos++;
      }
      pushToken({ type: 'other', raw: src.slice(start, pos) });
      continue;
    }

    // Literal string (...) with nested parens and backslash escapes
    if (ch === 0x28) {
      const start = pos;
      pos++;
      let depth = 1;
      while (pos < len && depth > 0) {
        const c = src.charCodeAt(pos);
        if (c === 0x5c) {
          pos += 2; // escaped char
        } else if (c === 0x28) {
          depth++;
          pos++;
        } else if (c === 0x29) {
          depth--;
          pos++;
        } else {
          pos++;
        }
      }
      pushToken({ type: 'other', raw: src.slice(start, pos) });
      continue;
    }

    // Dictionary << ... >> or Hex string < ... >
    if (ch === 0x3c) {
      const start = pos;
      if (pos + 1 < len && src.charCodeAt(pos + 1) === 0x3c) {
        pos += 2;
        pushToken({ type: 'other', raw: '<<' });
      } else {
        pos++;
        while (pos < len && src.charCodeAt(pos) !== 0x3e) pos++;
        if (pos < len) pos++;
        pushToken({ type: 'other', raw: src.slice(start, pos) });
      }
      continue;
    }

    if (ch === 0x3e) {
      if (pos + 1 < len && src.charCodeAt(pos + 1) === 0x3e) {
        pos += 2;
        pushToken({ type: 'other', raw: '>>' });
      } else {
        pos++;
        pushToken({ type: 'other', raw: '>' });
      }
      continue;
    }

    // Single-char delimiters: [ ] { }
    if (ch === 0x5b || ch === 0x5d || ch === 0x7b || ch === 0x7d) {
      pos++;
      pushToken({ type: 'other', raw: src[pos - 1] });
      continue;
    }

    // Name /...
    if (ch === 0x2f) {
      const start = pos;
      pos++;
      while (pos < len && !isWhitespace(src.charCodeAt(pos)) && !isDelimiter(src.charCodeAt(pos))) {
        pos++;
      }
      pushToken({ type: 'other', raw: src.slice(start, pos) });
      continue;
    }

    // Regular token (number or operator)
    const start = pos;
    while (pos < len && !isWhitespace(src.charCodeAt(pos)) && !isDelimiter(src.charCodeAt(pos))) {
      pos++;
    }
    const word = src.slice(start, pos);

    // Inline image block: BI ... ID <binary> EI — copy untouched!
    if (word === 'BI') {
      flushRecent();
      const biStart = start;
      // Scan forward for "EI" preceded by whitespace and followed by whitespace/EOF
      const eiIdx = findInlineImageEnd(src, pos);
      if (eiIdx !== -1) {
        outParts.push(src.slice(biStart, eiIdx));
        pos = eiIdx;
        continue;
      }
    }

    if (NUMBER_RE.test(word)) {
      pushToken({ type: 'number', raw: word, num: parseFloat(word) });
      continue;
    }

    // Check color operators!
    if (word === 'g' || word === 'G') {
      const nums = getTrailingNumbers(1);
      if (nums) {
        popTrailingNumbers(1);
        const [nr, ng, nb] = remapRgbUnit(nums[0], nums[0], nums[0], settings);
        const targetOp = word === 'g' ? 'rg' : 'RG';
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${targetOp}`,
        });
        continue;
      }
    } else if (word === 'rg' || word === 'RG') {
      const nums = getTrailingNumbers(3);
      if (nums) {
        popTrailingNumbers(3);
        const [nr, ng, nb] = remapRgbUnit(nums[0], nums[1], nums[2], settings);
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${word}`,
        });
        continue;
      }
    } else if (word === 'k' || word === 'K') {
      const nums = getTrailingNumbers(4);
      if (nums) {
        popTrailingNumbers(4);
        const [r, g, b] = cmykToRgb(nums[0], nums[1], nums[2], nums[3]);
        const [nr, ng, nb] = remapRgbUnit(r, g, b, settings);
        const targetOp = word === 'k' ? 'rg' : 'RG';
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${targetOp}`,
        });
        continue;
      }
    } else if (word === 'sc' || word === 'SC' || word === 'scn' || word === 'SCN') {
      // Handle DeviceRGB / ICCBased RGB (3 numbers) or DeviceGray (1 number) or CMYK (4 numbers)
      const isFill = word === 'sc' || word === 'scn';
      const targetOp = isFill ? 'rg' : 'RG';

      const nums4 = getTrailingNumbers(4);
      if (nums4) {
        popTrailingNumbers(4);
        const [r, g, b] = cmykToRgb(nums4[0], nums4[1], nums4[2], nums4[3]);
        const [nr, ng, nb] = remapRgbUnit(r, g, b, settings);
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${targetOp}`,
        });
        continue;
      }

      const nums3 = getTrailingNumbers(3);
      if (nums3) {
        popTrailingNumbers(3);
        const [nr, ng, nb] = remapRgbUnit(nums3[0], nums3[1], nums3[2], settings);
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${targetOp}`,
        });
        continue;
      }

      const nums1 = getTrailingNumbers(1);
      if (nums1) {
        popTrailingNumbers(1);
        const [nr, ng, nb] = remapRgbUnit(nums1[0], nums1[0], nums1[0], settings);
        pushToken({
          type: 'operator',
          raw: ` ${fmtNum(nr)} ${fmtNum(ng)} ${fmtNum(nb)} ${targetOp}`,
        });
        continue;
      }
    }

    pushToken({ type: 'operator', raw: word });
  }

  flushRecent();

  const finalStr = outParts.join('');
  const outBytes = new Uint8Array(finalStr.length);
  for (let i = 0; i < finalStr.length; i++) {
    outBytes[i] = finalStr.charCodeAt(i) & 0xff;
  }
  return outBytes;
}

function findInlineImageEnd(src: string, startPos: number): number {
  const idIdx = src.indexOf('ID', startPos);
  if (idIdx === -1) return -1;
  let searchFrom = idIdx + 2;
  while (searchFrom < src.length) {
    const eiIdx = src.indexOf('EI', searchFrom);
    if (eiIdx === -1) return -1;
    const prevCh = eiIdx > 0 ? src.charCodeAt(eiIdx - 1) : 0x20;
    const nextCh = eiIdx + 2 < src.length ? src.charCodeAt(eiIdx + 2) : 0x20;
    if (isWhitespace(prevCh) && (isWhitespace(nextCh) || isDelimiter(nextCh))) {
      return eiIdx + 2;
    }
    searchFrom = eiIdx + 2;
  }
  return -1;
}

function decodeStream(stream: PDFStream): Uint8Array | null {
  if (stream instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(stream).decode();
    } catch {
      return null;
    }
  }
  return null;
}

function rewriteFormXObjects(
  resources: PDFDict | undefined,
  pdfDoc: PDFDocument,
  settings: TransformSettings,
  visited: Set<string>
): void {
  if (!resources) return;
  const xObjects = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xObjects) return;

  for (const [, value] of xObjects.entries()) {
    if (!(value instanceof PDFRef)) continue;
    const refKey = value.toString();
    if (visited.has(refKey)) continue;
    visited.add(refKey);

    const obj = pdfDoc.context.lookup(value);
    if (!(obj instanceof PDFRawStream)) continue;

    const subtype = obj.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);
    if (subtype !== PDFName.of('Form')) continue; // Leave /Image XObjects 100% untouched!

    const decoded = decodeStream(obj);
    if (decoded) {
      const rewritten = rewriteContentStreamBytes(decoded, settings);
      const newStream = pdfDoc.context.flateStream(rewritten, {
        ...Object.fromEntries(
          obj.dict
            .entries()
            .filter(
              ([k]) =>
                k !== PDFName.of('Filter') &&
                k !== PDFName.of('Length') &&
                k !== PDFName.of('DecodeParms')
            )
            .map(([k, v]) => [k.decodeText(), v])
        ),
      });
      pdfDoc.context.assign(value, newStream);
    }

    // Recursively process nested Form XObjects
    const nestedResources = obj.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    rewriteFormXObjects(nestedResources, pdfDoc, settings, visited);
  }
}

/**
 * Exports a True Vector recolored PDF:
 * - Preserves 100% native vector fonts, infinite zoom sharpness, selectable/searchable/highlightable text
 * - Keeps file size tiny (nearly identical to the original PDF)
 * - Leaves all embedded raster photos & logos untouched (never color-inverted)
 * - Inserts a clean background fill + recolors vector text, rules, and shapes to the active Vellum mode
 */
export async function exportVectorPdf(
  originalBytes: Uint8Array,
  settings: TransformSettings,
  originalFileName: string,
  onProgress?: (progress: VectorExportProgress) => void
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdfDoc = await PDFDocument.load(originalBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const baseName = originalFileName.replace(/\.pdf$/i, '') || 'document';
  pdfDoc.setTitle(`${baseName} (${preset.name})`);
  pdfDoc.setProducer('Vellum True Vector PDF Transformer');

  const bgR = fmtNum(preset.paperRgb.r / 255);
  const bgG = fmtNum(preset.paperRgb.g / 255);
  const bgB = fmtNum(preset.paperRgb.b / 255);

  const softenFactor = settings.inkSoftness * (preset.isDark ? 0.1 : 0.14);
  const inkR = fmtNum(
    preset.inkRgb.r / 255 + (preset.paperRgb.r / 255 - preset.inkRgb.r / 255) * softenFactor
  );
  const inkG = fmtNum(
    preset.inkRgb.g / 255 + (preset.paperRgb.g / 255 - preset.inkRgb.g / 255) * softenFactor
  );
  const inkB = fmtNum(
    preset.inkRgb.b / 255 + (preset.paperRgb.b / 255 - preset.inkRgb.b / 255) * softenFactor
  );

  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  const visitedXObjects = new Set<string>();

  for (let i = 0; i < totalPages; i++) {
    onProgress?.({ currentPage: i + 1, totalPages, stage: 'transforming' });
    const page = pages[i];
    const pageDict = page.node;

    // 1. Rewrite any Form XObjects (headers, embedded diagrams, slides) while leaving /Image untouched
    const resources = pageDict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    rewriteFormXObjects(resources, pdfDoc, settings, visitedXObjects);

    // 2. Rewrite all page content streams
    const contents = pageDict.get(PDFName.of('Contents'));
    const streamRefs: PDFRef[] = [];

    if (contents instanceof PDFRef) {
      const resolved = pdfDoc.context.lookup(contents);
      if (resolved instanceof PDFArray) {
        for (let k = 0; k < resolved.size(); k++) {
          const item = resolved.get(k);
          if (item instanceof PDFRef) streamRefs.push(item);
        }
      } else if (resolved instanceof PDFStream) {
        streamRefs.push(contents);
      }
    } else if (contents instanceof PDFArray) {
      for (let k = 0; k < contents.size(); k++) {
        const item = contents.get(k);
        if (item instanceof PDFRef) streamRefs.push(item);
      }
    }

    for (const ref of streamRefs) {
      const obj = pdfDoc.context.lookup(ref);
      if (!(obj instanceof PDFRawStream)) continue;
      const decoded = decodeStream(obj);
      if (!decoded) continue;
      const rewritten = rewriteContentStreamBytes(decoded, settings);
      const compressed = pdfDoc.context.flateStream(rewritten);
      pdfDoc.context.assign(ref, compressed);
    }

    // 3. Prepend full-page background rectangle + default ink color (for text that omits explicit color)
    const { x, y, width, height } = page.getMediaBox();
    const prefixCommands = [
      'q',
      `${bgR} ${bgG} ${bgB} rg`,
      `${x} ${y} ${width} ${height} re`,
      'f',
      'Q',
      'q',
      `${inkR} ${inkG} ${inkB} rg`,
      `${inkR} ${inkG} ${inkB} RG`,
      '',
    ].join('\n');

    const suffixCommands = '\nQ\n';

    const prefixRef = pdfDoc.context.register(pdfDoc.context.flateStream(prefixCommands));
    const suffixRef = pdfDoc.context.register(pdfDoc.context.flateStream(suffixCommands));

    const newContentsArray = pdfDoc.context.obj([prefixRef, ...streamRefs, suffixRef]);
    pageDict.set(PDFName.of('Contents'), newContentsArray);
  }

  onProgress?.({ currentPage: totalPages, totalPages, stage: 'saving' });
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const fileName = `${baseName}-vellum-${preset.id}.pdf`;

  return { bytes, fileName };
}
