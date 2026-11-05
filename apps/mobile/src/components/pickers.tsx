import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Sélecteurs « liste qui s'ouvre » : pas de clavier, pas de saisie hasardeuse.

const pad = (n: number) => String(n).padStart(2, '0');

/** Feuille qui monte du bas avec des roues de sélection et un bouton Valider. */
function Sheet({ visible, title, onClose, onConfirm, children }: { visible: boolean; title: string; onClose: () => void; onConfirm: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: insets.bottom + Spacing.l }]}>
        <View style={[styles.grabber, { backgroundColor: t.line }]} />
        <Txt style={styles.sheetTitle}>{title}</Txt>
        {children}
        <Button label="Valider" onPress={onConfirm} />
      </View>
    </Modal>
  );
}

function Wheel({ values, value, onChange, label, format }: { values: number[]; value: number; onChange: (v: number) => void; label?: string; format?: (v: number) => string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 84, alignItems: 'stretch' }}>
      <Picker
        selectedValue={value}
        onValueChange={(v) => {
          Haptics.selectionAsync().catch(() => {});
          onChange(Number(v));
        }}
        style={[styles.wheel, Platform.OS === 'web' && { color: t.text, backgroundColor: t.surfaceAlt, borderColor: t.line }]}
        itemStyle={{ color: t.text, fontSize: 20, height: 190 }}
        dropdownIconColor={t.text}>
        {values.map((v) => (
          <Picker.Item key={v} label={format ? format(v) : String(v)} value={v} color={Platform.OS === 'android' ? undefined : t.text} />
        ))}
      </Picker>
      {label ? (
        <Txt variant="caption" muted style={{ textAlign: 'center' }}>
          {label}
        </Txt>
      ) : null}
    </View>
  );
}

/** Champ qui ressemble à une case, et qui ouvre la liste au toucher. */
function FieldButton({ label, value, placeholder, onPress, big, error }: { label: string; value: string | null; placeholder: string; onPress: () => void; big?: boolean; error?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value ?? placeholder}`}
      onPress={onPress}
      style={({ pressed }) => [styles.field, { backgroundColor: t.surfaceAlt, borderColor: error ? t.bad : 'transparent', opacity: pressed ? 0.8 : 1 }, big && styles.fieldBig]}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <View style={styles.fieldRow}>
        <Txt style={[value && big ? styles.bigValue : styles.value, { color: value ? t.text : t.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
          {value ?? placeholder}
        </Txt>
        <Ionicons name="chevron-down" size={18} color={t.textSecondary} />
      </View>
    </Pressable>
  );
}

/** Nombre entier dans une liste (poids, taille…). */
export function NumberPicker({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  initial,
  flex,
  step = 1,
}: {
  label: string;
  unit: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  initial: number;
  flex?: boolean;
  step?: number;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? initial);
  const values = useMemo(() => Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step), [min, max, step]);
  return (
    <View style={flex ? { flex: 1 } : undefined}>
      <FieldButton
        label={label}
        value={value != null ? `${value} ${unit}` : null}
        placeholder="Choisir"
        onPress={() => {
          setDraft(value ?? initial);
          setOpen(true);
        }}
        big
      />
      <Sheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          onChange(draft);
          setOpen(false);
        }}>
        <View style={styles.wheels}>
          <Wheel values={values} value={draft} onChange={setDraft} label={unit} />
        </View>
        {value != null && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}>
            <Txt variant="caption" muted style={{ textAlign: 'center' }}>
              Ne pas renseigner
            </Txt>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}

const fmtDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

/** Durée (chrono) en heures, minutes, secondes. */
export function DurationPicker({
  label,
  value,
  onChange,
  initial,
  withHours,
  hint,
  error,
}: {
  label: string;
  value: number | null;
  onChange: (sec: number) => void;
  initial: number;
  withHours: boolean;
  hint?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [s, setS] = useState(0);
  const start = () => {
    const v = value ?? initial;
    setH(Math.floor(v / 3600));
    setM(Math.floor((v % 3600) / 60));
    setS(v % 60);
    setOpen(true);
  };
  const hours = useMemo(() => Array.from({ length: 8 }, (_, i) => i), []);
  const sixty = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  return (
    <View style={{ gap: 4 }}>
      <FieldButton label={label} value={value != null ? fmtDuration(value) : null} placeholder="Choisir un temps" onPress={start} big error={error} />
      {hint ? (
        <Txt variant="caption" muted style={{ paddingHorizontal: 4 }}>
          {hint}
        </Txt>
      ) : null}
      <Sheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          const total = h * 3600 + m * 60 + s;
          if (total > 0) onChange(total);
          setOpen(false);
        }}>
        <View style={styles.wheels}>
          <Wheel values={hours} value={h} onChange={setH} label="heures" />
          <Wheel values={sixty} value={m} onChange={setM} label="minutes" format={pad} />
          <Wheel values={sixty} value={s} onChange={setS} label="secondes" format={pad} />
        </View>
      </Sheet>
    </View>
  );
}

// ---------- Calendrier ----------

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Calendrier mensuel : seuls les jours entre `min` et `max` (AAAA-MM-JJ) sont sélectionnables. */
export function CalendarPicker({ value, onChange, min, max, marked }: { value: string | null; onChange: (iso: string) => void; min: string; max: string; marked?: string[] }) {
  const t = useTheme();
  const first = value ?? min;
  const [ym, setYm] = useState({ y: Number(first.slice(0, 4)), m: Number(first.slice(5, 7)) - 1 });
  const minYm = { y: Number(min.slice(0, 4)), m: Number(min.slice(5, 7)) - 1 };
  const maxYm = { y: Number(max.slice(0, 4)), m: Number(max.slice(5, 7)) - 1 };
  const canPrev = ym.y * 12 + ym.m > minYm.y * 12 + minYm.m;
  const canNext = ym.y * 12 + ym.m < maxYm.y * 12 + maxYm.m;
  const shift = (d: number) => setYm(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (((m + d) % 12) + 12) % 12 }));

  const daysIn = new Date(ym.y, ym.m + 1, 0).getDate();
  const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // lundi = 0
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <View style={{ gap: Spacing.s }}>
      <View style={styles.calHead}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois précédent" disabled={!canPrev} onPress={() => shift(-1)} hitSlop={10} style={{ opacity: canPrev ? 1 : 0.25 }}>
          <Ionicons name="chevron-back" size={22} color={t.accent} />
        </Pressable>
        <Txt style={{ fontWeight: '700', fontSize: 16, textTransform: 'capitalize' }}>
          {MONTHS[ym.m]} {ym.y}
        </Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="Mois suivant" disabled={!canNext} onPress={() => shift(1)} hitSlop={10} style={{ opacity: canNext ? 1 : 0.25 }}>
          <Ionicons name="chevron-forward" size={22} color={t.accent} />
        </Pressable>
      </View>
      <View style={styles.calRow}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <Txt key={i} variant="caption" muted style={styles.calDow}>
            {d}
          </Txt>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={styles.calRow}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={styles.calCell} />;
            const day = iso(ym.y, ym.m, d);
            const ok = day >= min && day <= max;
            const on = day === value;
            const mark = marked?.includes(day);
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${d} ${MONTHS[ym.m]} ${ym.y}`}
                accessibilityState={{ selected: on, disabled: !ok }}
                disabled={!ok}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onChange(day);
                }}
                style={styles.calCell}>
                <View style={[styles.calDay, on && { backgroundColor: t.accent }]}>
                  <Txt style={{ fontWeight: on ? '700' : '500', fontVariant: ['tabular-nums'] }} color={on ? t.accentText : ok ? t.text : t.line}>
                    {d}
                  </Txt>
                </View>
                {mark && !on ? <View style={[styles.calMark, { backgroundColor: t.flame }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: Spacing.l, paddingTop: Spacing.s, gap: Spacing.m },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: Spacing.s },
  sheetTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  wheels: { flexDirection: 'row', gap: Spacing.s, alignItems: 'center' },
  wheel: { width: '100%', ...(Platform.OS === 'ios' ? { height: 190 } : {}), ...(Platform.OS === 'web' ? { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, fontSize: 18 } : {}) },
  field: { borderRadius: 14, borderWidth: 1, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, gap: 4 },
  fieldBig: { paddingVertical: Spacing.m },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.s },
  value: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  bigValue: { fontSize: 24, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  calRow: { flexDirection: 'row' },
  calDow: { flex: 1, textAlign: 'center' },
  calCell: { flex: 1, alignItems: 'center', height: 42, justifyContent: 'center' },
  calDay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calMark: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 3 },
});

/** Heure de départ (par quarts d'heure). */
export function ClockPicker({ label, value, onChange }: { label: string; value: string | null; onChange: (hhmm: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const hours = useMemo(() => Array.from({ length: 17 }, (_, i) => i + 5), []);
  const quarters = useMemo(() => [0, 15, 30, 45], []);
  return (
    <View>
      <FieldButton
        label={label}
        value={value ? `${Number(value.slice(0, 2))} h ${value.slice(3, 5)}` : null}
        placeholder="Je ne sais pas encore"
        onPress={() => {
          if (value) {
            setH(Number(value.slice(0, 2)));
            setM(Math.round(Number(value.slice(3, 5)) / 15) * 15 % 60);
          }
          setOpen(true);
        }}
      />
      <Sheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          onChange(`${pad(h)}:${pad(m)}`);
          setOpen(false);
        }}>
        <View style={styles.wheels}>
          <Wheel values={hours} value={h} onChange={setH} label="h" />
          <Wheel values={quarters} value={m} onChange={setM} label="min" format={pad} />
        </View>
        {value && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}>
            <Txt variant="caption" muted style={{ textAlign: 'center' }}>
              Je ne sais pas encore
            </Txt>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}
