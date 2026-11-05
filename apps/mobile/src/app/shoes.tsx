import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { DEFAULT_LIFE_KM, SHOE_BRANDS, SHOE_CATALOG, SHOE_CATEGORY_LABEL, type ShoeModel } from '@foulee/core';

import { WearBar } from '@/components/gear';
import { Button, Ionicons, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fmtInt } from '@/lib/labels';
import { formatDateFr, useStore } from '@/lib/store';

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function ShoesScreen() {
  const t = useTheme();
  const { shoes, addShoe, updateShoe, removeShoe, setDefaultShoe } = useStore();
  const [adding, setAdding] = useState(shoes.length === 0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const active = shoes.filter((s) => !s.shoe.retired);
  const retired = shoes.filter((s) => s.shoe.retired);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Txt muted>
          Chaque course validée s’ajoute à ta paire par défaut. Tu peux changer la paire d’une course depuis « Mes dernières courses ».
        </Txt>

        {active.map(({ shoe, wear, isDefault }) => (
          <View key={shoe.id} style={[styles.card, styles.shadow, { backgroundColor: t.surface }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Txt variant="caption" muted>
                  {shoe.brand}
                </Txt>
                <Txt style={styles.model}>{shoe.nickname ? `${shoe.model} · ${shoe.nickname}` : shoe.model}</Txt>
              </View>
              {isDefault ? (
                <View style={[styles.badge, { backgroundColor: t.accentSoft }]}>
                  <Ionicons name="star" size={12} color={t.accent} />
                  <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }}>
                    Par défaut
                  </Txt>
                </View>
              ) : null}
            </View>
            <WearBar wear={wear} lifeKm={shoe.lifeKm} />
            <Txt variant="caption" muted>
              Ajoutée le {formatDateFr(shoe.since, { day: 'numeric', month: 'long', year: 'numeric' })}
              {shoe.startKm ? ` avec ${fmtInt(shoe.startKm)} km déjà faits` : ''}
            </Txt>
            {confirmDelete === shoe.id ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button kind="secondary" small label="Annuler" onPress={() => setConfirmDelete(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button kind="flame" small label="Supprimer" onPress={() => removeShoe(shoe.id)} />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                {!isDefault && <Action icon="star-outline" label="Par défaut" onPress={() => setDefaultShoe(shoe.id)} />}
                <Action icon="archive-outline" label="Au placard" onPress={() => updateShoe(shoe.id, { retired: true })} />
                <Action icon="trash-outline" label="Supprimer" danger onPress={() => setConfirmDelete(shoe.id)} />
              </View>
            )}
          </View>
        ))}

        {adding ? (
          <AddShoe
            first={active.length === 0}
            onCancel={active.length ? () => setAdding(false) : undefined}
            onAdd={(s, def) => {
              addShoe(s, def);
              setAdding(false);
            }}
          />
        ) : (
          <Button icon="add" kind="secondary" label="Ajouter une paire" onPress={() => setAdding(true)} />
        )}

        {retired.length > 0 && (
          <View style={{ gap: Spacing.s }}>
            <Txt style={styles.sectionTitle} color={t.textSecondary}>
              Au placard
            </Txt>
            {retired.map(({ shoe, wear }) => (
              <View key={shoe.id} style={[styles.card, { backgroundColor: t.surfaceAlt }]}>
                <View style={styles.rowBetween}>
                  <Txt style={{ fontWeight: '600', flex: 1 }}>
                    {shoe.brand} {shoe.model}
                  </Txt>
                  <Txt variant="caption" muted>
                    {fmtInt(wear.km)} km
                  </Txt>
                </View>
                <Action icon="arrow-undo-outline" label="Ressortir" onPress={() => updateShoe(shoe.id, { retired: false })} />
              </View>
            ))}
          </View>
        )}

        <Txt variant="caption" muted>
          Durées de vie indicatives : 600 à 800 km pour une chaussure d’entraînement, 300 à 450 km pour une chaussure de compétition à plaque. L’amorti
          s’use avant que ça se voie : au-delà, le risque de douleurs augmente.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Action({ icon, label, onPress, danger }: { icon: 'star-outline' | 'archive-outline' | 'trash-outline' | 'arrow-undo-outline'; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  const c = danger ? t.bad : t.accent;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={15} color={c} />
      <Txt variant="caption" color={c} style={{ fontWeight: '600' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function AddShoe({
  first,
  onAdd,
  onCancel,
}: {
  first: boolean;
  onAdd: (s: { brand: string; model: string; nickname?: string; lifeKm: number; startKm: number }, makeDefault: boolean) => void;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const [brand, setBrand] = useState<string>('Nike');
  const [model, setModel] = useState<ShoeModel | 'autre' | null>(null);
  const [otherModel, setOtherModel] = useState('');
  const [nickname, setNickname] = useState('');
  const [startKm, setStartKm] = useState('0');
  const [lifeKm, setLifeKm] = useState(String(DEFAULT_LIFE_KM));
  const [makeDefault, setMakeDefault] = useState(true);

  const models = SHOE_CATALOG.filter((m) => m.brand === brand);
  const modelName = model === 'autre' ? otherModel.trim() : model?.model;
  const life = num(lifeKm);
  const start = num(startKm) ?? 0;
  const error = !modelName
    ? null
    : !life || life < 100 || life > 2000
      ? 'Durée de vie entre 100 et 2 000 km.'
      : start < 0 || start > 5000
        ? 'Kilomètres déjà faits entre 0 et 5 000.'
        : null;

  return (
    <View style={[styles.card, styles.shadow, { backgroundColor: t.surface }]}>
      <Txt style={styles.model}>{first ? 'Ta paire du moment' : 'Nouvelle paire'}</Txt>

      <Txt variant="caption" muted>
        Marque
      </Txt>
      <View style={styles.wrap}>
        {SHOE_BRANDS.map((b) => (
          <Pill
            key={b}
            label={b}
            active={brand === b}
            onPress={() => {
              setBrand(b);
              setModel(null);
            }}
          />
        ))}
        <Pill
          label="Autre"
          active={brand === 'Autre'}
          onPress={() => {
            setBrand('Autre');
            setModel('autre');
          }}
        />
      </View>

      {brand !== 'Autre' && (
        <>
          <Txt variant="caption" muted>
            Modèle
          </Txt>
          <View style={{ gap: 6 }}>
            {models.map((m) => {
              const on = model !== 'autre' && model?.model === m.model;
              return (
                <Pressable
                  key={m.model}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setModel(m);
                    setLifeKm(String(m.lifeKm));
                  }}
                  style={[styles.modelRow, { backgroundColor: on ? t.accentSoft : t.surfaceAlt, borderColor: on ? t.accent : 'transparent' }]}>
                  <Txt style={{ fontWeight: '600', flex: 1 }} color={on ? t.accent : t.text}>
                    {m.model}
                  </Txt>
                  <Txt variant="caption" muted>
                    {SHOE_CATEGORY_LABEL[m.category]} · ~{m.lifeKm} km
                  </Txt>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: model === 'autre' }}
              onPress={() => {
                setModel('autre');
                setLifeKm(String(DEFAULT_LIFE_KM));
              }}
              style={[styles.modelRow, { backgroundColor: model === 'autre' ? t.accentSoft : t.surfaceAlt, borderColor: model === 'autre' ? t.accent : 'transparent' }]}>
              <Txt style={{ fontWeight: '600', flex: 1 }} color={model === 'autre' ? t.accent : t.text}>
                Autre modèle
              </Txt>
            </Pressable>
          </View>
        </>
      )}

      {model === 'autre' && <Field label={brand === 'Autre' ? 'Marque et modèle' : 'Modèle'} value={otherModel} onChange={setOtherModel} placeholder="ex. Mach 6" />}
      {modelName ? (
        <>
          <Field label="Surnom (facultatif)" value={nickname} onChange={setNickname} placeholder="ex. les rouges" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Km déjà faits" value={startKm} onChange={setStartKm} numeric />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Durée de vie (km)" value={lifeKm} onChange={setLifeKm} numeric />
            </View>
          </View>
          {!first && (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }} onPress={() => setMakeDefault(!makeDefault)} style={styles.row}>
              <Ionicons name={makeDefault ? 'checkbox' : 'square-outline'} size={20} color={t.accent} />
              <Txt>Utiliser par défaut pour mes prochaines courses</Txt>
            </Pressable>
          )}
        </>
      ) : null}
      {error && (
        <Txt variant="caption" color={t.bad}>
          {error}
        </Txt>
      )}
      <View style={styles.row}>
        {onCancel && (
          <View style={{ flex: 1 }}>
            <Button kind="secondary" small label="Annuler" onPress={onCancel} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button
            small
            icon="add"
            label="Ajouter"
            disabled={!modelName || !!error}
            onPress={() =>
              onAdd(
                {
                  brand: brand === 'Autre' ? 'Autre' : brand,
                  model: modelName!.slice(0, 40),
                  nickname: nickname.trim() ? nickname.trim().slice(0, 24) : undefined,
                  lifeKm: Math.round(life!),
                  startKm: Math.round(start),
                },
                first || makeDefault,
              )
            }
          />
        </View>
      </View>
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.pill, { backgroundColor: active ? t.accent : t.surfaceAlt }]}>
      <Txt style={{ fontWeight: '600', fontSize: 14 }} color={active ? t.accentText : t.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

function Field({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: t.surfaceAlt }]}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.textSecondary}
        keyboardType={numeric ? 'number-pad' : 'default'}
        maxLength={numeric ? 5 : 40}
        style={[styles.input, { color: t.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  card: { borderRadius: 22, padding: Spacing.l, gap: Spacing.m },
  shadow: { boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)' },
  model: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: Spacing.l, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 14, minHeight: 34, justifyContent: 'center' },
  modelRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: Spacing.m, minHeight: 44, gap: Spacing.s },
  field: { borderRadius: 12, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s },
  input: { fontSize: 16, fontWeight: '600', paddingVertical: 4 },
});
