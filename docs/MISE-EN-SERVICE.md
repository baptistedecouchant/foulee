# Mise en service, sans ordinateur

Tout se configure depuis un navigateur : chaque service te donne une clé, que tu colles dans **GitHub → Settings → Secrets and variables → Actions → New repository secret**. GitHub fait ensuite le reste à chaque modification : serveur, base de données, fonctions, abonnement Strava et mise à jour de l'app.

Ne colle jamais une clé dans une conversation, uniquement dans GitHub.

## 1. Serveur (Supabase) — obligatoire pour Strava, Hub, coach et vrais RunCoins

1. Sur **supabase.com**, crée un projet nommé `foulee`, région **Europe (Paris ou Frankfurt)**. Choisis un mot de passe de base de données et garde-le.
2. **Authentication → Sign In / Providers** : active **Anonymous sign-ins**.
3. Ajoute ces secrets dans GitHub :

| Secret | Où le trouver |
|---|---|
| `SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID (ex. `abcdefghijkl`) |
| `SUPABASE_DB_PASSWORD` | le mot de passe choisi à la création |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → **Access Tokens** → Generate |
| `SUPABASE_ANON_KEY` | Project Settings → API → clé **anon public** |

4. Dans GitHub, onglet **Actions → Déployer le serveur → Run workflow**.

Dès que ces secrets existent, l'app publiée quitte le mode démo et utilise le vrai serveur.

## 1 bis. Comptes utilisateurs (connexion obligatoire)

Au premier lancement, l'app demande de se connecter avec **Apple**, **Google**, ou un **e-mail et un mot de passe** (avec prénom, nom et date de naissance). L'âge minimum est de 15 ans. Les deux consentements obligatoires (conditions d'utilisation et données de santé) sont horodatés.

Dans Supabase → **Authentication** :

1. **Sign In / Providers → Email** : activé, avec **Confirm email** activé.
   - « Allow anonymous sign-ins » n'est plus utilisé, tu peux le désactiver.
2. **Emails → Templates** : l'app demande un **code à 6 chiffres**, pas un lien. Remplace le contenu de ces modèles par un texte contenant `{{ .Token }}` :
   - **Confirm signup** : `Bienvenue sur Foulée ! Ton code de confirmation : {{ .Token }}`
   - **Reset Password** : `Ton code pour changer de mot de passe Foulée : {{ .Token }}`
3. **URL Configuration → Redirect URLs** : ajoute `exp://**` et `foulee://**` (retour après Google ou Apple).
4. **Serveur d'envoi des e-mails (obligatoire pour inviter d'autres personnes)** : sans lui, Supabase n'envoie les codes qu'aux membres de ton équipe Supabase, 2 par heure, et interdit de modifier les modèles. Ajoute ces secrets dans GitHub, le déploiement configure tout (serveur, modèles en français avec le code à 6 chiffres, limite de 60 e-mails par heure) :

| Secret | Resend (avec ton domaine) | Brevo (sans domaine) |
|---|---|---|
| `SMTP_HOST` | `smtp.resend.com` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `465` | `587` |
| `SMTP_USER` | `resend` | l'identifiant SMTP affiché par Brevo |
| `SMTP_PASS` | ta clé API Resend | la clé SMTP Brevo |
| `SMTP_SENDER` | `codes@ton-domaine.fr` | l'adresse validée dans Brevo |
5. **Google** : **Providers → Google**, colle le *Client ID* et le *Client secret* du client OAuth « Web » créé dans Google Cloud. Dans Google Cloud, l'URL de redirection autorisée est `https://<ta référence>.supabase.co/auth/v1/callback`.
6. **Apple** : **Providers → Apple**. Dans « Client IDs », mets `app.foulee.mobile` (connexion native sur iPhone). Pour la connexion par navigateur, crée un *Services ID* et une clé *Sign in with Apple* sur developer.apple.com.

Tant que Google et Apple ne sont pas configurés, leurs boutons affichent « Cette méthode de connexion n'est pas encore activée ». L'e-mail fonctionne tout de suite.

## 2. Strava

1. Va sur **strava.com/settings/api** et crée une application. Dans **Authorization Callback Domain**, indique `<ta référence>.supabase.co`.
2. Ajoute ces secrets dans GitHub :

| Secret | Valeur |
|---|---|
| `STRAVA_CLIENT_ID` | Client ID |
| `STRAVA_CLIENT_SECRET` | Client Secret |
| `STRAVA_VERIFY_TOKEN` | un mot au hasard, par exemple `foulee-2026` |

3. Relance **Déployer le serveur**. L'abonnement aux nouvelles séances Strava est créé automatiquement.
4. Dans l'app : **Montres & apps → Connecter Strava**.

Une nouvelle application Strava ne peut connecter que ton propre compte. Pour l'ouvrir à tous, il faut demander à Strava une augmentation de la limite, ce qui passe par une revue de l'app.

## 3. Coach IA

Ajoute le secret `ANTHROPIC_API_KEY`, à créer sur console.anthropic.com → API Keys, puis relance **Déployer le serveur**.

## 4. Garmin

- **Tout de suite** : dans Garmin Connect, va dans Paramètres → Applications partenaires → Strava. Tes séances Garmin passent alors par Strava.
- **En direct** : il faut candidater au Garmin Connect Developer Program (developer.garmin.com), réservé aux entreprises, avec une validation de quelques semaines. Le code est prêt (`garmin-webhook`, `push-workout`) ; il restera à brancher les identifiants fournis.

## 5. Apple Santé, Nike Run Club, pas du jour, GPS écran verrouillé, pubs

Ces fonctions utilisent des **modules natifs** : elles ne marchent pas dans Expo Go, mais dans la **version installée** de l'app (« development build », puis TestFlight et App Store).

1. Inscris-toi au **Apple Developer Program** (99 $/an, developer.apple.com).
2. **Une seule fois**, depuis n'importe quel ordinateur avec Node.js :
   ```bash
   cd foulee/apps/mobile
   npx eas-cli build --profile development --platform ios
   ```
   EAS te demande de te connecter à ton compte Apple, crée les certificats et enregistre ton iPhone. Ouvre le lien proposé sur l'iPhone pour l'enregistrer.
3. Ensuite, tout se fait depuis GitHub : **Actions → Construire l'app → Run workflow**. Tu installes le résultat depuis la page du build sur expo.dev.

Une fois l'app installée :
- **Montres & apps → Connecter Apple Santé** : iOS demande l'autorisation, puis tes séances (Apple Watch, Nike Run Club, Runna…) sont importées et vérifiées.
- Les **pas du jour** s'affichent sur l'accueil.
- Les **vraies pubs AdMob** remplacent la pub de démonstration.

## 6. Publicités récompensées (AdMob)

1. Crée un compte sur **admob.google.com** et ajoute l'app (iOS, puis Android). Crée un bloc d'annonces **Récompensé** pour chacune.
2. Dans le bloc récompensé, active **Vérification côté serveur** et colle l'adresse : `https://<ta référence>.supabase.co/functions/v1/ad-reward`
3. Remplace les identifiants de **test** :
   - dans `apps/mobile/app.json`, le plugin `react-native-google-mobile-ads` (`iosAppId`, `androidAppId`) ;
   - les variables `EXPO_PUBLIC_ADMOB_REWARDED_IOS` et `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID`. Demande-moi, je les ajoute aux publications.
4. Avant la production :
   - formulaire de consentement RGPD (Google UMP, déjà inclus dans le module) ;
   - déclaration « publicités » sur l'App Store ;
   - fichier `app-ads.txt` sur ton site.

Comment le crédit est sécurisé : l'app ne crédite jamais les RunCoins elle-même. Google appelle `ad-reward` avec un message signé. Le serveur vérifie la signature avec les clés publiques de Google, refuse les doublons, applique les plafonds, puis crédite.

## Récapitulatif des secrets GitHub

| Secret | Obligatoire pour |
|---|---|
| `EXPO_TOKEN` | ✅ déjà fait : publication de l'app |
| `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ANON_KEY` | serveur |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_VERIFY_TOKEN` | Strava |
| `ANTHROPIC_API_KEY` | coach IA |
