import { PAPER_PRESETS, type TransformSettings } from './presets';

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Fast deterministic hash for subtle organic paper grain.
 * Returns a value in [-1, 1].
 */
function paperNoise(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return (n / 2147483647.5) - 1;
}

/**
 * Transforms a rendered PDF page's ImageData in-place to apply:
 * 1. White-to-paper background mapping (Kraft, Parchment, Sepia, Dim Slate)
 * 2. Harsh black-to-soft charcoal/espresso ink remapping
 * 3. Optional color preservation for charts, highlights, and photos
 * 4. Optional subtle paper fiber grain
 */
export function transformPageImageData(
  imageData: ImageData,
  settings: TransformSettings
): ImageData {
  if (settings.showOriginal) {
    return imageData;
  }

  const preset = PAPER_PRESETS[settings.presetId];
  const { data, width, height } = imageData;

  const paperR = preset.paperRgb.r;
  const paperG = preset.paperRgb.g;
  const paperB = preset.paperRgb.b;

  // Adjust ink slightly toward paper color based on inkSoftness (0..1)
  // This softens harsh pure black into warm espresso/charcoal without losing legibility.
  const softenFactor = settings.inkSoftness * 0.14;
  const inkR = preset.inkRgb.r + (paperR - preset.inkRgb.r) * softenFactor;
  const inkG = preset.inkRgb.g + (paperG - preset.inkRgb.g) * softenFactor;
  const inkB = preset.inkRgb.b + (paperB - preset.inkRgb.b) * softenFactor;

  const deltaR = paperR - inkR;
  const deltaG = paperG - inkG;
  const deltaB = paperB - inkB;

  const grainAmp = settings.grain * (preset.isDark ? 6 : 10);
  const applyGrain = grainAmp > 0.25;
  const preserveColors = settings.preserveColors;
  const isDark = preset.isDark;

  const paperRNorm = paperR / 255;
  const paperGNorm = paperG / 255;
  const paperBNorm = paperB / 255;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = rowOffset + x * 4;
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Perceptual luminance in [0, 1]
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Base achromatic remapping: 0 (black text) -> ink, 1 (white page) -> paper
      let outR = inkR + deltaR * lum;
      let outG = inkG + deltaG * lum;
      let outB = inkB + deltaB * lum;

      if (preserveColors) {
        const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const chroma = maxC - minC;

        // Only blend chromatic pixels (charts, links, photos, colored headings)
        if (chroma > 14) {
          const sat = maxC > 0 ? chroma / maxC : 0;
          // Smooth weight so near-gray text stays pure ink while vivid graphics keep color
          const colorWeight = Math.min(1, sat * 1.35) * Math.min(1, (chroma - 14) / 40);

          if (isDark) {
            // In dark mode, invert luminance while preserving hue, then harmonize with slate
            const invLum = 1 - lum;
            const scale = lum > 0.02 ? (0.25 + invLum * 0.7) / Math.max(0.25, lum) : 1;
            const darkR = Math.min(235, r * scale * 0.85 + paperR * 0.22);
            const darkG = Math.min(235, g * scale * 0.85 + paperG * 0.22);
            const darkB = Math.min(235, b * scale * 0.85 + paperB * 0.22);

            outR = outR + (darkR - outR) * colorWeight * 0.85;
            outG = outG + (darkG - outG) * colorWeight * 0.85;
            outB = outB + (darkB - outB) * colorWeight * 0.85;
          } else {
            // Multiply original color with paper tone so it looks printed ON the brown/parchment paper
            const multR = r * paperRNorm;
            const multG = g * paperGNorm;
            const multB = b * paperBNorm;

            outR = outR + (multR - outR) * colorWeight;
            outG = outG + (multG - outG) * colorWeight;
            outB = outB + (multB - outB) * colorWeight;
          }
        }
      }

      if (applyGrain) {
        // Fine fiber + subtle broader paper mottling
        const fine = paperNoise(x, y);
        const coarse = paperNoise(x >> 2, y >> 2);
        const grainDelta = (fine * 0.65 + coarse * 0.35) * grainAmp;
        // Apply grain slightly more to paper background than to dark ink
        const grainWeight = isDark ? 0.6 + (1 - lum) * 0.4 : 0.35 + lum * 0.65;
        const gShift = grainDelta * grainWeight;
        outR += gShift;
        outG += gShift * 0.96;
        outB += gShift * 0.88;
      }

      data[i] = clampByte(outR);
      data[i + 1] = clampByte(outG);
      data[i + 2] = clampByte(outB);
    }
  }

  return imageData;
}
