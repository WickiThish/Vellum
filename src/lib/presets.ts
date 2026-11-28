export type PresetId = 'true-dark' | 'graphite' | 'eink' | 'sage' | 'oled-black';

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
  /** Subtle border color for miniature preview cards */
  borderHex: string;
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
  'true-dark': {
    id: 'true-dark',
    name: 'True Dark',
    tagline: 'Pure neutral #0F0F0F & crisp #E3E3E3 text',
    isDark: true,
    paperHex: '#0F0F0F',
    paperRgb: { r: 15, g: 15, b: 15 },
    inkHex: '#E3E3E3',
    inkRgb: { r: 227, g: 227, b: 227 },
    borderHex: '#2B2B2B',
    defaultGrain: 0,
    defaultSoftness: 0,
  },
  graphite: {
    id: 'graphite',
    name: 'Soft Graphite',
    tagline: 'Anti-halation dark grey for multi-hour sessions',
    isDark: true,
    paperHex: '#232529',
    paperRgb: { r: 35, g: 37, b: 41 },
    inkHex: '#D8DADF',
    inkRgb: { r: 216, g: 218, b: 223 },
    borderHex: '#3A3D44',
    defaultGrain: 0,
    defaultSoftness: 0.05,
  },
  eink: {
    id: 'eink',
    name: 'E-Ink Grey',
    tagline: 'Matte neutral light grey for bright rooms',
    isDark: false,
    paperHex: '#E2E4E7',
    paperRgb: { r: 226, g: 228, b: 231 },
    inkHex: '#1A1C1E',
    inkRgb: { r: 26, g: 28, b: 30 },
    borderHex: '#BFC4CB',
    defaultGrain: 0,
    defaultSoftness: 0.08,
  },
  sage: {
    id: 'sage',
    name: 'Soft Sage',
    tagline: 'Ultra-subtle cool mist for calm daytime reading',
    isDark: false,
    paperHex: '#DFE6E0',
    paperRgb: { r: 223, g: 230, b: 224 },
    inkHex: '#1B241E',
    inkRgb: { r: 27, g: 36, b: 30 },
    borderHex: '#BCC8BE',
    defaultGrain: 0,
    defaultSoftness: 0.08,
  },
  'oled-black': {
    id: 'oled-black',
    name: 'OLED Black',
    tagline: 'Pure #000000 pixels-off black & soft #D4D4D4 ink',
    isDark: true,
    paperHex: '#000000',
    paperRgb: { r: 0, g: 0, b: 0 },
    inkHex: '#D4D4D4',
    inkRgb: { r: 212, g: 212, b: 212 },
    borderHex: '#242424',
    defaultGrain: 0,
    defaultSoftness: 0,
  },
};

export const PRESET_LIST: PaperPreset[] = [
  PAPER_PRESETS['true-dark'],
  PAPER_PRESETS.graphite,
  PAPER_PRESETS.eink,
  PAPER_PRESETS.sage,
  PAPER_PRESETS['oled-black'],
];

export const DEFAULT_SETTINGS: TransformSettings = {
  presetId: 'true-dark',
  grain: PAPER_PRESETS['true-dark'].defaultGrain,
  inkSoftness: PAPER_PRESETS['true-dark'].defaultSoftness,
  preserveColors: true,
  showOriginal: false,
};

export function resolvePresetId(id: string | undefined): PresetId {
  if (id && id in PAPER_PRESETS) {
    return id as PresetId;
  }
  return 'true-dark';
}
