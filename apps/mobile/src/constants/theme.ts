import { Platform } from 'react-native';

// Bleu cobalt (action, allures) + or (points et récompenses).
export const Colors = {
  light: {
    text: '#101521',
    textSecondary: '#5B6478',
    background: '#F3F5F9',
    surface: '#FFFFFF',
    line: '#DCE1EA',
    accent: '#2747F5',
    accentText: '#FFFFFF',
    accentSoft: '#E6EAFE',
    gold: '#F2B705',
    goldText: '#3A2C00',
    ok: '#1E8E5A',
    warn: '#B86E00',
    bad: '#C8402B',
  },
  dark: {
    text: '#E9EDF5',
    textSecondary: '#98A2B8',
    background: '#0C1018',
    surface: '#151B27',
    line: '#263042',
    accent: '#7088FF',
    accentText: '#0C1018',
    accentSoft: '#1D2650',
    gold: '#FFCB3D',
    goldText: '#2A1F00',
    ok: '#45C285',
    warn: '#E6A93A',
    bad: '#F07A62',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const Spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const Radius = { s: 8, m: 14, l: 20 } as const;
