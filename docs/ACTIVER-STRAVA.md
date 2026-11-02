# Activer la récupération des séances (Strava) et le coach IA

Compte environ 30 minutes, à faire une seule fois. Tout se fait depuis ton Mac, dans le Terminal, à la racine du dossier `foulee`.

Pourquoi Strava en premier : c'est la seule source qu'on peut brancher **tout de suite**, et elle couvre déjà presque tout.
Garmin, Coros, Polar, Suunto et l'Apple Watch (via l'app Strava) peuvent envoyer automatiquement leurs séances sur Strava.

---

## 1. Créer le serveur (Supabase, gratuit)

1. Crée un compte sur https://supabase.com, puis **New project**.
   - Nom : `foulee`.
   - Région : **Europe (Paris ou Frankfurt)**, important pour le RGPD.
   - Note le mot de passe de la base.
2. Une fois le projet créé, va dans **Project Settings → API** et note :
   - **Project URL** (ex. `https://abcdefgh.supabase.co`) ; `abcdefgh` est ta « référence de projet ») ;
   - **anon public key**.
3. Va dans **Authentication → Sign In / Providers** et active **Anonymous sign-ins**.
   Grâce à ça, l'utilisateur commence sans créer de compte.

## 2. Envoyer la base de données et les fonctions

```bash
npx supabase login
```

```bash
npx supabase link --project-ref abcdefgh
```
(remplace `abcdefgh` par ta référence de projet)

```bash
npx supabase db push
```

## 3. Créer l'application Strava

1. Va sur https://www.strava.com/settings/api (connecté à ton compte Strava).
2. Remplis le formulaire :
   - **Application Name** : Foulée.
   - **Category** : Training.
   - **Website** : n'importe quelle adresse (ton GitHub par exemple).
   - **Authorization Callback Domain** : `abcdefgh.supabase.co` (ta référence de projet).
3. Note le **Client ID** et le **Client Secret**.

Une nouvelle application Strava ne peut connecter que ton propre compte. C'est suffisant pour tester. Pour ouvrir l'app à d'autres coureurs, il faudra demander à Strava d'augmenter la limite.

## 4. Renseigner les secrets du serveur

Copie `supabase/.env.example` en `supabase/.env` et remplis-le :

```
ANTHROPIC_API_KEY=sk-ant-...        # clé du coach IA : https://console.anthropic.com
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=...
STRAVA_VERIFY_TOKEN=un-mot-au-hasard
APP_INTEGRITY_ENFORCED=false
```

```bash
npx supabase secrets set --env-file supabase/.env
```

## 5. Déployer les fonctions

```bash
npm run sync:core
```

```bash
npx supabase functions deploy
```

## 6. Abonner le serveur aux nouvelles séances Strava

Remplace les valeurs, puis lance (une seule fois) :

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions -F client_id=12345 -F client_secret=TON_SECRET -F callback_url=https://abcdefgh.supabase.co/functions/v1/strava-webhook -F verify_token=un-mot-au-hasard
```

La réponse doit contenir un `id`. À partir de là, chaque nouvelle course enregistrée sur Strava arrive toute seule dans Foulée.

## 7. Brancher l'app sur le serveur

Crée le fichier `apps/mobile/.env` :

```
EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=ta-cle-anon
```

Relance l'app :

```bash
cd apps/mobile && npx expo start --clear
```

## 8. Tester

1. Dans l'app, crée un objectif (onglet **Entraînements**).
2. Onglet **Montres**, puis **Connecter Strava** : la page Strava s'ouvre. Accepte en cochant bien l'accès aux activités.
3. Les courses des 30 derniers jours sont importées et vérifiées par l'anti-triche. Celles qui tombent sur une séance prévue rapportent des points et de l'XP.
4. Va courir avec ta montre : quelques minutes après la synchro Strava, la séance est validée dans Foulée.
5. Onglet **Coach** : pose une question, le coach répond en s'appuyant sur tout ton historique.

---

## Et les autres sources ?

| Source | Comment l'activer | Délai |
|---|---|---|
| **Garmin** | Tout de suite : Garmin Connect → Paramètres → Applications partenaires → **Strava** (synchro automatique). En direct : candidature au Garmin Connect Developer Program (déjà préparé dans le code). | Immédiat via Strava, quelques semaines en direct |
| **Apple Watch / Apple Santé** | Tout de suite via l'app Strava (Réglages → Applications → Santé). En direct : une version installée de l'app (« development build »), et non Expo Go. Nécessite un compte Apple Developer (99 $/an). | Immédiat via Strava |
| **Nike Run Club** | Nike n'offre aucun accès direct. Nike Run Club écrit dans Apple Santé (iPhone) et Health Connect (Android) : Foulée les lira par là une fois le module Santé ajouté. | Avec la version installée de l'app |
| **Coros, Polar, Suunto** | Synchro automatique vers Strava depuis leur app. | Immédiat via Strava |
