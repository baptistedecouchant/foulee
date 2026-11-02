# Architecture de Foulée

## Choix techniques

| Brique | Choix | Pourquoi |
|---|---|---|
| App mobile | **Expo (React Native) + TypeScript** | Un seul code pour iOS et Android, accès aux modules natifs (HealthKit, Health Connect, WorkoutKit) via les config plugins, builds et publication sur les stores dans le cloud avec EAS, mises à jour correctives sans repasser par la validation des stores (EAS Update). |
| Backend | **Supabase** (Postgres, Auth, Edge Functions, Vault) | Base relationnelle adaptée aux points et aux échanges (transactions), règles d'accès par ligne (RLS), stockage chiffré des jetons OAuth, fonctions serveur pour les webhooks. |
| Moteur métier | **`@foulee/core`** (TypeScript pur) | Le même code calcule le plan et vérifie les séances sur le téléphone (aperçu) et sur le serveur (décision). Testé indépendamment (`npm test`). |
| Coach IA | **Claude (API Anthropic)**, appelé uniquement depuis le serveur | La clé d'API n'est jamais dans l'app. Sortie JSON validée par schéma. |

## Comment un plan est construit

1. **Objectif** : un chrono (ex. 10 km en 45:00) ou une distance (ex. finir un semi), une date, un niveau actuel (chrono récent ou niveau déclaratif), 2 à 5 séances par semaine.
2. **Faisabilité** (`goal.ts`) : le niveau actuel est projeté sur la distance visée (formule de Riegel). Le gain réaliste est plafonné à environ 1,2 % par semaine (15 % max). Si l'objectif est hors de portée, l'app propose un chrono réaliste. Un délai trop court est refusé.
3. **Plan** (`plan.ts`), calculé par des règles et non par l'IA : périodisation (fondations, développement, spécifique, affûtage), semaine allégée toutes les 4 semaines, allures dérivées du niveau et qui progressent vers l'objectif, séance de course le jour J.
4. **IA** (`prompts.ts`, fonction `coach`) : ajoute uniquement des textes (conseil, nutrition, focus de la semaine). Le serveur rattache ces textes aux séances existantes et ignore tout le reste. L'IA ne peut ni changer une allure ni ajouter une séance.

## Sécurité anti-triche (GPS et capteurs)

Principe : **le téléphone ne décide jamais**. Les points sont calculés et écrits par le serveur, après contrôle.

### Contrôles sur chaque activité (`antiCheat.ts`)

| Contrôle | Ce qu'il détecte | Effet |
|---|---|---|
| Saisie manuelle (Garmin, Strava `manual`, HealthKit `WasUserEntered`, Health Connect `MANUAL_ENTRY`) | Activité inventée | Refus |
| Positions simulées (`mocked` sur Android) | Application de faux GPS | Refus |
| Horodatages désordonnés | Trace modifiée à la main | Refus |
| Vitesse soutenue > 27 km/h (moyenne glissante 30 s) | Voiture, vélo, trottinette | Refus |
| Sauts de position > 15 m/s répétés | Téléportation, montage de traces | Refus si répétés |
| Vitesse et rythme d'enregistrement parfaitement constants | Trace générée par un simulateur | Refus |
| Foulée calculée (vitesse ÷ cadence) hors 0,4–2,6 m | Vélo, appareil secoué à la main | Alerte ou refus |
| Fréquence cardiaque figée ou non humaine | Capteur falsifié | Alerte |
| Distance déclarée ≠ distance de la trace | Distance gonflée | Alerte ou refus |
| Empreinte de trace déjà connue (tous comptes) | Même trace renvoyée deux fois | Refus |
| Même sortie reçue par deux sources | Garmin + Strava, montre + Strava | Comptée une fois, depuis la source la plus fiable |

Un score de confiance de 0 à 100 en découle : `trusted` (points crédités), `review` (points en attente de contrôle), `rejected` (aucun point).

### Garde-fous au niveau du compte et du système

- **Base de données** : aucune règle n'autorise le téléphone à écrire des activités, des validations ou des points. Seules les fonctions serveur le peuvent.
- **Journal de points en écriture seule et idempotent** : chaque gain a une clé unique, si bien qu'un webhook reçu deux fois ne paie pas deux fois.
- **Plafond quotidien** de points de séance : 600 pts par jour.
- **Confiance du compte** : chaque activité refusée la fait baisser. Après 3 refus, les récompenses sont suspendues.
- **Échanges atomiques** (`redeem_reward`) : verrou par utilisateur, vérification du solde et du stock dans la même transaction. Le solde ne peut pas devenir négatif, même avec deux échanges simultanés.
- **Jetons OAuth** (Garmin, Strava) stockés chiffrés dans Supabase Vault, jamais renvoyés au téléphone.
- **Session utilisateur** stockée dans le trousseau iOS / Keystore Android (`expo-secure-store`).
- **Attestation de l'app** (Apple App Attest, Google Play Integrity) : prévue dans `requireAppIntegrity`, à activer avant la production. Elle garantit que les requêtes viennent de l'app officielle, sur un vrai appareil.
- **Plan calculé par le serveur** : l'utilisateur ne peut pas se fabriquer un plan « facile » ou gonflé en points.

## Intégrations

| Plateforme | Lecture des activités | Envoi des séances | État |
|---|---|---|---|
| Garmin | Webhook `garmin-webhook` (Activity API) | `push-workout` (Training API) | Branché sur le pipeline. Lecture du format à finaliser avec la doc Garmin une fois l'accès développeur obtenu. |
| Strava | Webhook `strava-webhook` | Non disponible chez Strava | Prêt. Les données Strava ne sont pas envoyées à l'IA (conditions de l'API). |
| Apple Santé | Lu sur l'iPhone puis envoyé à `ingest-activity` | WorkoutKit, depuis l'iPhone | Interface prévue (`lib/health.ts`). Module natif à ajouter. |
| Health Connect | Lu sur Android puis envoyé à `ingest-activity` | Non | Interface prévue. Module natif à ajouter. |

## Publication sur les stores

- **Identifiants** : `app.foulee.mobile` (iOS et Android), à remplacer par le domaine de la société.
- **Builds** : `eas build --profile production`, puis `eas submit`. Pas besoin de Mac pour iOS.
- **Apple** : compte Apple Developer (99 $/an). Le texte d'usage de Santé est déjà dans `app.json`. Prévoir la fiche de confidentialité (données de santé et de localisation) et la mention que les récompenses ne sont pas des jeux d'argent.
- **Google** : compte Play Console (25 $ une fois). Remplir la déclaration Health Connect et la section « Sécurité des données ». La localisation en arrière-plan est bloquée par défaut (`blockedPermissions`), car elle n'est pas nécessaire tant que l'app ne fait pas elle-même l'enregistrement GPS.
- **RGPD** : les données de fréquence cardiaque et d'activité sont des données de santé (article 9). Il faut un consentement explicite, un hébergement en UE (choisir la région UE pour Supabase) et une politique de confidentialité.

## Prochaines étapes

1. Créer le projet Supabase (région UE), appliquer la migration, déployer les fonctions.
2. Ajouter l'authentification dans l'app (e-mail et connexion Apple/Google).
3. Modules natifs HealthKit, WorkoutKit et Health Connect, puis premier build de développement.
4. Candidature au Garmin Connect Developer Program, puis finalisation de `garmin-webhook` et `push-workout`.
5. Activer App Attest et Play Integrity.
6. Catalogue de récompenses réel : partenaires et codes dans `rewards` / `reward_codes`.
