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
  return n / 2147483647.5 - 1;
}

/**
 * Transforms a rendered PDF page's ImageData in-place:
 * - Light paper presets (Kraft, Parchment, Sepia): maps white to warm paper and black to espresso/charcoal ink.
 * - Charcoal Dark preset: maps white to deep charcoal (#1D1F23) and black text to crystal-clear off-white (#EFECE6)
 *   using a text-clarity curve, while NEVER inverting embedded photos or flipping hues of colored charts/links.
 *
 * @param photoMask Optional per-pixel mask (1 = embedded raster photo/image to preserve un-inverted).
 */
export function transformPageImageData(
  imageData: ImageData,
  settings: TransformSettings,
  photoMask?: Uint8Array | null
): ImageData {
  if (settings.showOriginal) {
    return imageData;
  }

  const preset = PAPER_PRESETS[settings.presetId] ?? PAPER_PRESETS['true-dark'];
  const { data, width, height } = imageData;

  const paperR = preset.paperRgb.r;
  const paperG = preset.paperRgb.g;
  const paperB = preset.paperRgb.b;

  // Adjust ink slightly toward paper color based on inkSoftness (0..1)
  const softenFactor = settings.inkSoftness * (preset.isDark ? 0.1 : 0.14);
  const inkR = preset.inkRgb.r + (paperR - preset.inkRgb.r) * softenFactor;
  const inkG = preset.inkRgb.g + (paperG - preset.inkRgb.g) * softenFactor;
  const inkB = preset.inkRgb.b + (paperB - preset.inkRgb.b) * softenFactor;

  const deltaR = paperR - inkR;
  const deltaG = paperG - inkG;
  const deltaB = paperB - inkB;

  const grainAmp = settings.grain * (preset.isDark ? 5 : 10);
  const applyGrain = grainAmp > 0.25;
  const preserveColors = settings.preserveColors;
  const isDark = preset.isDark;

  const paperRNorm = paperR / 255;
  const paperGNorm = paperG / 255;
  const paperBNorm = paperB / 255;

  for (let y = 0; y < height; y++) {
    const rowPixelBase = y * width;
    const rowOffset = rowPixelBase * 4;

    for (let x = 0; x < width; x++) {
      const pixelIdx = rowPixelBase + x;
      const i = rowOffset + x * 4;
      const a = data[i + 3];
      if (a === 0) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 1. Embedded raster photo/illustration: NEVER invert colors!
      if (preserveColors && photoMask && photoMask[pixelIdx] === 1) {
        if (isDark) {
          // Keep true natural colors with gentle eye-comfort dimming (~91%) so photos don't glare on charcoal
          data[i] = clampByte(r * 0.91 + 4);
          data[i + 1] = clampByte(g * 0.91 + 4);
          data[i + 2] = clampByte(b * 0.91 + 5);
        } else {
          // Subtle 18% paper harmony so photos sit naturally on warm paper without looking muddy
          data[i] = clampByte(r * (0.82 + 0.18 * paperRNorm));
          data[i + 1] = clampByte(g * (0.82 + 0.18 * paperGNorm));
          data[i + 2] = clampByte(b * (0.82 + 0.18 * paperBNorm));
        }
        continue;
      }

      // Perceptual luminance in [0, 1]
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      let outR: number;
      let outG: number;
      let outB: number;

      if (isDark) {
        // Crystal-clear dark-mode text curve:
        // inkAmount = 0 (white background) -> charcoal paper
        // inkAmount = 1 (black text)       -> crisp off-white ink
        const inkAmount = 1 - lum;
        if (inkAmount < 0.025) {
          // Snap near-white paper cleanly to pure charcoal (removes faint JPEG/PDF haze)
          outR = paperR;
          outG = paperG;
          outB = paperB;
        } else {
          // Subtle gamma lift (0.86) keeps anti-aliased glyph stems crisp & legible on dark charcoal
          const crisp = Math.pow(inkAmount, 0.86);
          outR = paperR + (inkR - paperR) * crisp;
          outG = paperG + (inkG - paperG) * crisp;
          outB = paperB + (inkB - paperB) * crisp;
        }
      } else {
        // Light paper presets: smooth luminance mapping from espresso/charcoal ink to warm paper
        outR = inkR + deltaR * lum;
        outG = inkG + deltaG * lum;
        outB = inkB + deltaB * lum;
      }

      if (preserveColors) {
        const maxC = r > g ? (r > b ? r : b) : g > b ? g : b;
        const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
        const chroma = maxC - minC;

        if (chroma > 14) {
          const sat = maxC > 0 ? chroma / maxC : 0;

          if (isDark) {
            // Very pale tinted callout boxes (high luminance, low saturation) -> subtle tinted charcoal card
            if (lum > 0.84 && sat < 0.22) {
              const tintStrength = 0.22;
              const darkCardR = paperR + 12 + (r - 220) * tintStrength;
              const darkCardG = paperG + 13 + (g - 220) * tintStrength;
              const darkCardB = paperB + 15 + (b - 220) * tintStrength;
              outR = darkCardR;
              outG = darkCardG;
              outB = darkCardB;
            } else {
              // Colored charts, headings, links, highlights: keep TRUE natural hue (never invert!)
              // If a dark saturated color (e.g. dark navy link) is too dim for charcoal, lift its brightness along the same hue
              const colorWeight = Math.min(1, sat * 1.4) * Math.min(1, (chroma - 14) / 36);
              const minReadableLum = 0.44;
              let lift = 1;
              if (lum < minReadableLum && lum > 0.03) {
                lift = Math.min(2.1, (minReadableLum + (minReadableLum - lum) * 0.25) / lum);
              } else if (lum > 0.78) {
                // Slightly tame overly bright neon fills on dark mode
                lift = 0.88;
              }
              const naturalR = Math.min(242, r * lift);
              const naturalG = Math.min(242, g * lift);
              const naturalB = Math.min(242, b * lift);

              outR = outR + (naturalR - outR) * colorWeight;
              outG = outG + (naturalG - outG) * colorWeight;
              outB = outB + (naturalB - outB) * colorWeight;
            }
          } else {
            // Light paper modes: multiply original color with paper tone so it looks printed on the paper
            const colorWeight = Math.min(1, sat * 1.35) * Math.min(1, (chroma - 14) / 40);
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
        const fine = paperNoise(x, y);
        const coarse = paperNoise(x >> 2, y >> 2);
        const grainDelta = (fine * 0.65 + coarse * 0.35) * grainAmp;
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
