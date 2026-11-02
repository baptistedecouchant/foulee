// Version web : pas de pubs natives (voir ads.native.ts pour iOS et Android).
export const REWARDED_UNIT_ID = '';
export const nativeAdsAvailable = () => false;
export const showRewardedAd = async (_userId: string): Promise<boolean> => false;
