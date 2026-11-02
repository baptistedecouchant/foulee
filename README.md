# Foulée

Application mobile (iOS et Android) de préparation à la course à pied : l'utilisateur choisit un objectif (un chrono ou une distance), reçoit un plan sur mesure envoyé sur sa montre, et gagne des points échangeables contre des bons d'achat chaque fois qu'une séance est réellement faite et vérifiée.

## Structure

```
foulee/
├── apps/mobile/          App Expo (React Native + TypeScript), publiée sur l'App Store et le Google Play Store
├── packages/core/        Moteur partagé : objectifs, plans, anti-triche GPS, validation, points, prompts IA
├── supabase/
│   ├── migrations/       Base de données Postgres + règles d'accès (RLS)
│   └── functions/        Fonctions serveur : ingestion des activités, webhooks Garmin/Strava, coach IA, échanges
└── docs/ARCHITECTURE.md  Choix techniques, sécurité, publication sur les stores
```

## Démarrer

```bash
npm install
npm test                      # tests du moteur (plan, anti-triche, points)
cd apps/mobile && npx expo start
```

Sans backend configuré, l'app tourne en **mode démo** : tout est calculé sur le téléphone, et chaque séance propose de simuler l'activité reçue (séance bien suivie, trop rapide, écourtée, saisie à la main, trajet en voiture, GPS falsifié) pour voir les contrôles anti-triche à l'œuvre.

## Documentation

- [docs/MISE-EN-SERVICE.md](docs/MISE-EN-SERVICE.md) : tout activer depuis GitHub (serveur, Strava, coach, Apple Santé, pubs)
- [docs/PARAMETRES.md](docs/PARAMETRES.md) : tous les réglages, composant par composant
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : choix techniques et sécurité

## Activer Strava et le coach IA

Guide pas à pas : [docs/ACTIVER-STRAVA.md](docs/ACTIVER-STRAVA.md).

## Backend (Supabase)

```bash
npm run sync:core             # copie le moteur dans les fonctions serveur
supabase db push
supabase secrets set --env-file supabase/.env
supabase functions deploy
```

Puis renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` dans `apps/mobile/.env`.

## Publication

```bash
cd apps/mobile
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform all
```

Détails dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
