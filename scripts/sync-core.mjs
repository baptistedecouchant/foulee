// Copie le moteur partagé dans les fonctions Supabase (Deno ne lit pas les
// workspaces npm). À lancer avant `supabase functions deploy`.
import { cpSync, rmSync } from 'node:fs';
const dest = new URL('../supabase/functions/_shared/core/', import.meta.url);
rmSync(dest, { recursive: true, force: true });
cpSync(new URL('../packages/core/src/', import.meta.url), dest, { recursive: true });
console.log('Moteur copié dans supabase/functions/_shared/core');
