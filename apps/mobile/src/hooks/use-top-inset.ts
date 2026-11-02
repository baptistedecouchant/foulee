import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Marge haute des écrans d'onglets. Sur iOS, `contentInsetAdjustmentBehavior="automatic"`
 * gère déjà la barre d'état ; sur Android il faut l'ajouter ; sur le web, la barre d'onglets est en haut.
 */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') return 0;
  if (Platform.OS === 'web') return 72;
  return insets.top + 8;
}
