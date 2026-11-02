// Pubs vidéo récompensées (Google AdMob, via react-native-google-mobile-ads).
//
// Sécurité : l'app ne crédite JAMAIS les RunCoins elle-même. Google appelle notre serveur
// (fonction `ad-reward`, « Server-Side Verification ») avec un message signé ; le serveur vérifie
// la signature avec les clés publiques de Google, applique les plafonds, puis crédite.
//
// Module natif : disponible dans l'app installée, pas dans Expo Go (on affiche alors une pub de démo).

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Identifiants de TEST fournis par Google : à remplacer par les tiens (console AdMob) avant la production. */
export const REWARDED_UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS ?? 'ca-app-pub-3940256099942544/1712485313',
  android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID ?? 'ca-app-pub-3940256099942544/5224354917',
  default: '',
});

type AdsModule = typeof import('react-native-google-mobile-ads');
let mod: AdsModule | null | undefined;

function ads(): AdsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (mod = null);
  try {
    mod = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    mod = null;
  }
  return mod;
}

export const nativeAdsAvailable = () => ads() !== null;

/**
 * Affiche une pub récompensée. Résout `true` si l'utilisateur l'a regardée jusqu'au bout.
 * `userId` est transmis à Google, qui le renvoie signé à notre serveur pour créditer le bon compte.
 */
export function showRewardedAd(userId: string): Promise<boolean> {
  const m = ads();
  if (!m) return Promise.resolve(false);
  return new Promise((resolve) => {
    const ad = m.RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true, // pas de ciblage tant que le consentement RGPD n'est pas recueilli
      serverSideVerificationOptions: { userId },
    });
    let earned = false;
    const subs = [
      ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => ad.show()),
      ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(m.AdEventType.CLOSED, () => {
        subs.forEach((u) => u());
        resolve(earned);
      }),
      ad.addAdEventListener(m.AdEventType.ERROR, () => {
        subs.forEach((u) => u());
        resolve(false);
      }),
    ];
    ad.load();
  });
}
