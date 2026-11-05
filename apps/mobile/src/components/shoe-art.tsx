import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Line, Path, Rect, Stop } from 'react-native-svg';
import { categoryOf, type ShoeCategory } from '@foulee/core';

/**
 * Illustration de chaussure, dessinée (pas de photo de marque) :
 * la silhouette dépend du type de modèle (entraînement, rythme, compétition à plaque, trail)
 * et le coloris est choisi par le coureur.
 */

export interface Colorway {
  id: string;
  label: string;
  upper: string;
  accent: string;
  mid: string;
  sole: string;
}

export const COLORWAYS: Colorway[] = [
  { id: 'noir', label: 'Noir', upper: '#22262F', accent: '#FF5A36', mid: '#F3F4F7', sole: '#14161B' },
  { id: 'blanc', label: 'Blanc', upper: '#F2F4F8', accent: '#3A4BFF', mid: '#FFFFFF', sole: '#2A2E38' },
  { id: 'bleu', label: 'Bleu', upper: '#2B4BDB', accent: '#FFD23F', mid: '#F5F7FF', sole: '#1B2340' },
  { id: 'rouge', label: 'Rouge', upper: '#E23B3B', accent: '#1E1E24', mid: '#FFF5F2', sole: '#2A1414' },
  { id: 'fluo', label: 'Jaune fluo', upper: '#D7F24A', accent: '#14161B', mid: '#FAFFE6', sole: '#2A2E1A' },
  { id: 'rose', label: 'Rose', upper: '#FF7BB0', accent: '#5B2DE0', mid: '#FFF4F9', sole: '#3A1F2C' },
  { id: 'orange', label: 'Orange', upper: '#FF8A2B', accent: '#FFFFFF', mid: '#FFF4EA', sole: '#33200F' },
  { id: 'vert', label: 'Vert', upper: '#1E8E6A', accent: '#C9F5E4', mid: '#F2FBF7', sole: '#10261F' },
  { id: 'gris', label: 'Gris', upper: '#9AA3B5', accent: '#FF5A36', mid: '#FFFFFF', sole: '#2A2E38' },
];

/** Coloris par défaut propre à chaque modèle (stable). */
export function defaultColorway(brand: string, model: string): string {
  let h = 0;
  for (const c of `${brand}:${model}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORWAYS[h % COLORWAYS.length].id;
}

const SHAPE: Record<ShoeCategory, { stack: number; toe: number; lugs: boolean; plate: boolean }> = {
  quotidien: { stack: 18, toe: 6, lugs: false, plate: false },
  tempo: { stack: 15, toe: 8, lugs: false, plate: false },
  competition: { stack: 22, toe: 11, lugs: false, plate: true },
  trail: { stack: 13, toe: 5, lugs: true, plate: false },
};

export const ShoeArt = memo(function ShoeArt({
  brand,
  model,
  color,
  width = 120,
  style,
}: {
  brand: string;
  model: string;
  color?: string;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const cw = COLORWAYS.find((c) => c.id === (color ?? defaultColorway(brand, model))) ?? COLORWAYS[0];
  const sh = SHAPE[categoryOf(brand, model)];
  const base = 84; // dessous de la semelle
  const top = base - 4 - sh.stack; // haut de la semelle intermédiaire
  const toeY = top + 4 - sh.toe * 0.3;
  const gid = `g-${cw.id}-${sh.stack}`;

  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={`Illustration ${brand} ${model}`}>
      <Svg width={width} height={width / 2} viewBox="0 0 200 100">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cw.upper} stopOpacity={1} />
            <Stop offset="1" stopColor={cw.upper} stopOpacity={0.82} />
          </LinearGradient>
        </Defs>
        {/* Ombre au sol */}
        <Ellipse cx={104} cy={93} rx={86} ry={4} fill="#000" opacity={0.08} />

        {/* Semelle extérieure (et crampons en trail) */}
        <Path d={`M18 ${base - 4} L186 ${base - 4 - sh.toe} Q196 ${base - 6 - sh.toe} 194 ${base - sh.toe} Q186 ${base + 1} 176 ${base} L26 ${base} Q16 ${base} 18 ${base - 4} Z`} fill={cw.sole} />
        {sh.lugs && (
          <G fill={cw.sole}>
            {[30, 46, 62, 78, 94, 110, 126, 142, 158].map((x) => (
              <Rect key={x} x={x} y={base - 1} width={8} height={4} rx={1.5} />
            ))}
          </G>
        )}

        {/* Semelle intermédiaire */}
        <Path
          d={`M18 ${base - 4} L18 ${top + 2} Q18 ${top} 22 ${top} C 70 ${top - 1} 130 ${top + 1} 176 ${toeY} Q192 ${toeY + 1} 194 ${base - sh.toe - 2} L186 ${base - 4 - sh.toe} Z`}
          fill={cw.mid}
        />
        {sh.plate && <Path d={`M26 ${top + sh.stack * 0.55} C 80 ${top + sh.stack * 0.6} 130 ${top + sh.stack * 0.5} 186 ${base - sh.toe - 6}`} stroke={cw.accent} strokeWidth={1.6} fill="none" opacity={0.9} />}
        {!sh.plate && <Path d={`M30 ${top + sh.stack * 0.5} C 80 ${top + sh.stack * 0.45} 130 ${top + sh.stack * 0.4} 172 ${toeY + 4}`} stroke={cw.sole} strokeWidth={0.8} fill="none" opacity={0.25} />}

        {/* Tige */}
        <Path
          d={`M22 ${top} C 14 ${top - 20} 14 30 26 20 Q34 15 42 20 C 50 27 58 30 68 29 C 98 27 124 30 148 40 C 168 48 186 ${toeY - 12} 188 ${toeY - 2} Q 184 ${toeY + 1} 176 ${toeY} C 130 ${top + 1} 70 ${top - 1} 22 ${top} Z`}
          fill={`url(#${gid})`}
        />
        {/* Renfort de talon et pare-pierres */}
        <Path d={`M22 ${top} C 15 ${top - 16} 15 38 22 30 C 34 36 40 ${top - 12} 48 ${top} Z`} fill={cw.accent} opacity={0.95} />
        <Path d={`M150 ${top + 1} C 162 ${top - 6} 176 ${toeY - 7} 186 ${toeY - 1} Q 182 ${toeY + 1} 176 ${toeY} C 166 ${toeY - 1} 158 ${top + 1} 150 ${top + 1} Z`} fill={cw.accent} opacity={0.55} />
        {/* Ligne de vitesse (décor générique, sans logo) */}
        <Path d={`M54 ${top - 8} C 82 ${top - 14} 108 ${top - 26} 136 ${top - 20}`} stroke={cw.accent} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        <Path d={`M62 ${top - 2} C 90 ${top - 6} 114 ${top - 14} 140 ${top - 10}`} stroke={cw.accent} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={0.6} />
        {/* Col et lacets */}
        <Ellipse cx={34} cy={22} rx={9} ry={3.4} fill="#000" opacity={0.35} transform="rotate(12 34 22)" />
        <G stroke={cw.mid} strokeWidth={2.2} strokeLinecap="round" opacity={0.95}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Line key={i} x1={66 + i * 13} y1={30 + i * 1.6} x2={72 + i * 13} y2={39 + i * 2.2} />
          ))}
        </G>
        <Circle cx={27} cy={28} r={1.6} fill={cw.mid} opacity={0.8} />
      </Svg>
    </View>
  );
});
