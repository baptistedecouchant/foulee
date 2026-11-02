// Utilisé par GitHub Actions après `eas init` : configure les mises à jour EAS
// pour qu'elles s'ouvrent dans Expo Go (version d'exécution = version du SDK).
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../apps/mobile/app.json', import.meta.url);
const app = JSON.parse(readFileSync(path, 'utf8'));
const id = app.expo?.extra?.eas?.projectId;
if (!id) {
  console.error('projectId introuvable : `eas init` a-t-il réussi ?');
  process.exit(1);
}
app.expo.updates = { ...(app.expo.updates ?? {}), url: `https://u.expo.dev/${id}` };
app.expo.runtimeVersion = { policy: 'sdkVersion' };
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');
console.log(`Projet Expo ${id} configuré pour EAS Update.`);
