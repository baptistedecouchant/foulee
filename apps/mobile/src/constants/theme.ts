import { Platform } from 'react-native';

// Identité « arcade sportive » : bleu électrique → violet pour l'action et l'XP,
// orange flamme pour la série, or pour les points. Fonds profonds en sombre.
export const Colors = {
  light: {
    text: '#0B1020',
    textSecondary: '#5A6380',
    background: '#EEF1F8',
    surface: '#FFFFFF',
    surfaceAlt: '#F6F7FC',
    line: '#DDE2EE',
    accent: '#3A4BFF',
    accentDark: '#2533C9',
    accentText: '#FFFFFF',
    accentSoft: '#E5E8FF',
    violet: '#7B3FF2',
    flame: '#FF6A2B',
    flameSoft: '#FFE7DC',
    gold: '#FFC233',
    goldDark: '#D99A00',
    goldText: '#3A2A00',
    xp: '#16C784',
    xpSoft: '#D9F7EA',
    ok: '#12A06A',
    warn: '#C97800',
    bad: '#E0452B',
  },
  dark: {
    text: '#EEF1FA',
    textSecondary: '#97A0BD',
    background: '#070B16',
    surface: '#111729',
    surfaceAlt: '#18203A',
    line: '#252E4A',
    accent: '#6C7BFF',
    accentDark: '#4351E0',
    accentText: '#FFFFFF',
    accentSoft: '#1B2252',
    violet: '#A47BFF',
    flame: '#FF8247',
    flameSoft: '#3A1E12',
    gold: '#FFCB47',
    goldDark: '#C7920C',
    goldText: '#2A1E00',
    xp: '#3BE0A0',
    xpSoft: '#0F3328',
    ok: '#3BD08F',
    warn: '#F2B34A',
    bad: '#FF7A61',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

/** Dégradés « héros » (cartes d'objectif, séance du jour, niveau). */
export const Gradients = {
  energy: ['#2B3BFF', '#7B3FF2'] as const,
  flame: ['#FF8A3D', '#FF3D6E'] as const,
  gold: ['#FFD65C', '#FF9F1C'] as const,
  xp: ['#1ED69A', '#14A3C7'] as const,
  night: ['#0B1230', '#2A1252'] as const,
  shade: ['rgba(7,11,22,0)', 'rgba(7,11,22,0.85)'] as const,
};

export const Fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
};

export const Spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const Radius = { s: 12, m: 18, l: 26, pill: 999 } as const;
