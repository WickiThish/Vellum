export type PresetId = 'charcoal' | 'kraft' | 'parchment' | 'sepia';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PaperPreset {
  id: PresetId;
  name: string;
  tagline: string;
  isDark: boolean;
  /** Target color for pure white (#FFFFFF) page backgrounds */
  paperHex: string;
  paperRgb: RGB;
  /** Target color for pure black (#000000) text ink */
  inkHex: string;
  inkRgb: RGB;
  /** Outer desk/canvas background surrounding the PDF pages */
  deskHex: string;
  /** UI surface color (toolbar, cards) */
  surfaceHex: string;
  /** Subtle border color for UI chrome */
  borderHex: string;
  /** Muted secondary UI text */
  mutedInkHex: string;
  /** Accent color for active controls */
  accentHex: string;
  /** Text color on top of accent background */
  accentInkHex: string;
  /** Default grain strength (0 to 1) */
  defaultGrain: number;
  /** Default ink softness (0 = crispest, 1 = softest) */
  defaultSoftness: number;
}

export interface TransformSettings {
  presetId: PresetId;
  /** Subtle paper fiber texture (0 = off, 1 = strong) */
  grain: number;
  /** Softens harsh contrast toward comfortable ink tones (0 to 1) */
  inkSoftness: number;
  /** Preserves natural colors of embedded photos, charts, and highlights */
  preserveColors: boolean;
  /** Show original untransformed PDF for before/after comparison */
  showOriginal: boolean;
}

export const PAPER_PRESETS: Record<PresetId, PaperPreset> = {
  charcoal: {
    id: 'charcoal',
    name: 'Charcoal Dark',
    tagline: 'Dark grey charcoal & crisp off-white ink',
    isDark: true,
    paperHex: '#1D1F23',
    paperRgb: { r: 29, g: 31, b: 35 },
    inkHex: '#EFECE6',
    inkRgb: { r: 239, g: 236, b: 230 },
    deskHex: '#121316',
    surfaceHex: '#1A1C20',
    borderHex: '#2E323A',
    mutedInkHex: '#9FA4AE',
    accentHex: '#D4A977',
    accentInkHex: '#151310',
    defaultGrain: 0,
    defaultSoftness: 0.15,
  },
  kraft: {
    id: 'kraft',
    name: 'Kraft Paper',
    tagline: 'Warm brown paper & deep espresso ink',
    isDark: false,
    paperHex: '#D8C2A3',
    paperRgb: { r: 216, g: 194, b: 163 },
    inkHex: '#2B2017',
    inkRgb: { r: 43, g: 32, b: 23 },
    deskHex: '#BFA787',
    surfaceHex: '#E3D1B7',
    borderHex: '#B49B79',
    mutedInkHex: '#5C4938',
    accentHex: '#6E472B',
    accentInkHex: '#FAF3E8',
    defaultGrain: 0.45,
    defaultSoftness: 0.35,
  },
  parchment: {
    id: 'parchment',
    name: 'Warm Parchment',
    tagline: 'Soft aged vellum & warm charcoal ink',
    isDark: false,
    paperHex: '#F0E4CE',
    paperRgb: { r: 240, g: 228, b: 206 },
    inkHex: '#2E261F',
    inkRgb: { r: 46, g: 38, b: 31 },
    deskHex: '#DBD0BC',
    surfaceHex: '#F7EFE0',
    borderHex: '#CFC1A8',
    mutedInkHex: '#645849',
    accentHex: '#7A5432',
    accentInkHex: '#FDF8F0',
    defaultGrain: 0.3,
    defaultSoftness: 0.3,
  },
  sepia: {
    id: 'sepia',
    name: 'Soft Sepia',
    tagline: 'Gentle amber tone & dark walnut ink',
    isDark: false,
    paperHex: '#E6D2B2',
    paperRgb: { r: 230, g: 210, b: 178 },
    inkHex: '#35261A',
    inkRgb: { r: 53, g: 38, b: 26 },
    deskHex: '#CEB896',
    surfaceHex: '#EFE0C6',
    borderHex: '#C2AA86',
    mutedInkHex: '#68523C',
    accentHex: '#805129',
    accentInkHex: '#FBF4E9',
    defaultGrain: 0.35,
    defaultSoftness: 0.35,
  },
};

export const PRESET_LIST: PaperPreset[] = [
  PAPER_PRESETS.charcoal,
  PAPER_PRESETS.kraft,
  PAPER_PRESETS.parchment,
  PAPER_PRESETS.sepia,
];

export const DEFAULT_SETTINGS: TransformSettings = {
  presetId: 'charcoal',
  grain: PAPER_PRESETS.charcoal.defaultGrain,
  inkSoftness: PAPER_PRESETS.charcoal.defaultSoftness,
  preserveColors: true,
  showOriginal: false,
};
