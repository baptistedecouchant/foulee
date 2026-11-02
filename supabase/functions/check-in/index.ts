// Connexion du jour : enregistrée avec la date du SERVEUR (on ne peut pas tricher en changeant
// l'heure du téléphone), puis recalcul des gains (coffre de la série, bonus de bienvenue).

import { adminClient, handle, json, requireUser } from '../_shared/supabase.ts';
import { syncLedger } from '../_shared/ingest.ts';

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const db = adminClient();
    // Jour en heure de Paris
    const day = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    await db.from('daily_checkins').upsert({ user_id: user.id, day }, { onConflict: 'user_id,day', ignoreDuplicates: true });
    await syncLedger(db, user.id);
    const { data } = await db.from('daily_checkins').select('day').eq('user_id', user.id).order('day', { ascending: false }).limit(400);
    return json({ days: (data ?? []).map((d) => d.day).reverse() });
  }),
);
