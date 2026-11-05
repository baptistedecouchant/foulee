// Hub social : vue d'ensemble, amis, défis entre joueurs, conversations.
// Les statistiques et les classements sont calculés ici, à partir des activités
// VÉRIFIÉES par l'anti-triche uniquement (et jamais visibles par des non-amis).

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { challengeValue, CHALLENGES, distanceLabel, formatTime, leaderboard, periodStats, type FriendGoal, type HubChallenge, type HubConversation, type HubOverview, type Plan, type RunRecord } from '../_shared/core/index.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

const DAY = 86_400_000;

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const body = await req.json();
    const db = adminClient();
    const me = user.id;

    switch (body.action) {
      case 'overview':
        return json(await overview(db, me));

      case 'set_profile': {
        const name = String(body.displayName ?? '').trim().slice(0, 24);
        if (name.length < 2) throw new HttpError(400, 'name_too_short');
        await db.from('profiles').update({ display_name: name, city: body.city ? String(body.city).slice(0, 40) : null }).eq('id', me);
        return json({ ok: true });
      }

      case 'add_friend': {
        const code = String(body.code ?? '').trim().toUpperCase();
        const { data: other } = await db.from('profiles').select('id').eq('friend_code', code).maybeSingle();
        if (!other || other.id === me) throw new HttpError(404, 'code_not_found');
        if (await isBlocked(db, other.id, me)) throw new HttpError(404, 'code_not_found');
        const [a, b] = [me, other.id].sort();
        const { data: existing } = await db.from('friendships').select('*').eq('user_a', a).eq('user_b', b).maybeSingle();
        if (existing?.status === 'accepted') return json({ ok: true, status: 'accepted' });
        // S'il m'avait déjà invité, ajouter son code vaut acceptation.
        if (existing && existing.requested_by !== me) {
          await db.from('friendships').update({ status: 'accepted' }).eq('user_a', a).eq('user_b', b);
          return json({ ok: true, status: 'accepted' });
        }
        await db.from('friendships').upsert({ user_a: a, user_b: b, requested_by: me, status: 'pending' });
        return json({ ok: true, status: 'pending' });
      }

      case 'respond_friend': {
        const [a, b] = [me, String(body.userId)].sort();
        if (body.accept) await db.from('friendships').update({ status: 'accepted' }).eq('user_a', a).eq('user_b', b).neq('requested_by', me);
        else await db.from('friendships').delete().eq('user_a', a).eq('user_b', b);
        return json({ ok: true });
      }

      case 'remove_friend':
      case 'block': {
        const other = String(body.userId);
        const [a, b] = [me, other].sort();
        await db.from('friendships').delete().eq('user_a', a).eq('user_b', b);
        if (body.action === 'block') await db.from('blocks').upsert({ blocker: me, blocked: other });
        return json({ ok: true });
      }

      case 'report': {
        await db.from('reports').insert({
          reporter: me,
          reported: String(body.userId),
          message_id: body.messageId ?? null,
          reason: String(body.reason ?? 'Non précisé').slice(0, 500),
        });
        return json({ ok: true });
      }

      case 'open_conversation': {
        const other = String(body.userId);
        if (!(await friends(db, me, other))) throw new HttpError(403, 'not_friends');
        const { data: mine } = await db.from('conversation_members').select('conversation_id').eq('user_id', me);
        const ids = (mine ?? []).map((m) => m.conversation_id);
        if (ids.length) {
          const { data: shared } = await db
            .from('conversation_members')
            .select('conversation_id, conversations!inner(kind)')
            .eq('user_id', other)
            .in('conversation_id', ids)
            .eq('conversations.kind', 'direct')
            .limit(1);
          if (shared?.length) return json({ conversationId: shared[0].conversation_id });
        }
        const { data: conv } = await db.from('conversations').insert({ kind: 'direct' }).select('id').single();
        await db.from('conversation_members').insert([
          { conversation_id: conv!.id, user_id: me },
          { conversation_id: conv!.id, user_id: other },
        ]);
        return json({ conversationId: conv!.id });
      }

      case 'create_challenge': {
        const t = CHALLENGES.find((c) => c.id === body.templateId);
        if (!t) throw new HttpError(400, 'unknown_challenge');
        const invitees: string[] = Array.isArray(body.invitees) ? body.invitees.slice(0, 10).map(String) : [];
        if (!invitees.length) throw new HttpError(400, 'no_invitees');
        for (const u of invitees) if (!(await friends(db, me, u))) throw new HttpError(403, 'not_friends');
        const now = Date.now();
        const { data: ch } = await db
          .from('challenges')
          .insert({ template_id: t.id, created_by: me, starts_at: new Date(now).toISOString(), ends_at: new Date(now + t.durationDays * DAY).toISOString() })
          .select('id')
          .single();
        await db.from('challenge_participants').insert([
          { challenge_id: ch!.id, user_id: me, status: 'accepted' },
          ...invitees.map((u) => ({ challenge_id: ch!.id, user_id: u, status: 'invited' })),
        ]);
        return json({ challengeId: ch!.id });
      }

      case 'respond_challenge': {
        await db
          .from('challenge_participants')
          .update({ status: body.accept ? 'accepted' : 'declined' })
          .eq('challenge_id', String(body.challengeId))
          .eq('user_id', me)
          .eq('status', 'invited');
        return json({ ok: true });
      }

      default:
        throw new HttpError(400, 'unknown_action');
    }
  }),
);

async function friends(db: SupabaseClient, a: string, b: string): Promise<boolean> {
  const [x, y] = [a, b].sort();
  const { data } = await db.from('friendships').select('status').eq('user_a', x).eq('user_b', y).maybeSingle();
  return data?.status === 'accepted';
}

async function isBlocked(db: SupabaseClient, blocker: string, blocked: string): Promise<boolean> {
  const { data } = await db.from('blocks').select('blocker').eq('blocker', blocker).eq('blocked', blocked).maybeSingle();
  return !!data;
}

/** Courses vérifiées des utilisateurs depuis `since`. */
async function runsOf(db: SupabaseClient, users: string[], since: number): Promise<Map<string, RunRecord[]>> {
  const out = new Map<string, RunRecord[]>(users.map((u) => [u, []]));
  if (!users.length) return out;
  const { data } = await db
    .from('activities')
    .select('user_id, start_time, distance_m')
    .in('user_id', users)
    .eq('trust_verdict', 'trusted')
    .is('duplicate_of', null)
    .gte('start_time', new Date(since).toISOString());
  for (const a of data ?? []) out.get(a.user_id)?.push({ startTime: new Date(a.start_time).getTime(), distanceM: a.distance_m });
  return out;
}

/** Objectifs en cours des amis qui acceptent de les partager, avec leur avancement. */
async function friendGoals(db: SupabaseClient, users: string[]): Promise<Map<string, FriendGoal[]>> {
  const out = new Map<string, FriendGoal[]>();
  if (!users.length) return out;
  const { data: sharing } = await db.from('profiles').select('id').in('id', users).eq('share_goals', true);
  const ids = (sharing ?? []).map((p) => p.id);
  if (!ids.length) return out;
  const { data: plans } = await db.from('plans').select('id, user_id, plan').in('user_id', ids).eq('status', 'active');
  const planIds = (plans ?? []).map((p) => p.id);
  const { data: vals } = planIds.length
    ? await db.from('session_validations').select('plan_id, session_id, status').in('plan_id', planIds).in('status', ['validee', 'partielle'])
    : { data: [] };
  const today = new Date().toISOString().slice(0, 10);
  for (const row of plans ?? []) {
    const plan = row.plan as Plan;
    const g = plan.request.goal;
    const done = new Set((vals ?? []).filter((v) => v.plan_id === row.id).map((v) => v.session_id));
    const title = g.race?.name ?? (g.mode === 'chrono' && g.targetTimeSec ? `${distanceLabel(g.distanceKm)} en ${formatTime(g.targetTimeSec)}` : `Finir : ${distanceLabel(g.distanceKm)}`);
    const goal: FriendGoal = {
      title: g.race?.name && g.mode === 'chrono' && g.targetTimeSec ? `${title} · ${formatTime(g.targetTimeSec)}` : title,
      eventDate: g.eventDate,
      done: plan.sessions.filter((s) => done.has(s.id)).length,
      due: plan.sessions.filter((s) => s.date <= today).length,
      total: plan.sessions.length,
    };
    out.set(row.user_id, [...(out.get(row.user_id) ?? []), goal]);
  }
  return out;
}

async function overview(db: SupabaseClient, me: string): Promise<HubOverview> {
  const now = Date.now();
  const { data: profile } = await db.from('profiles').select('id, display_name, friend_code, city, avatar_color').eq('id', me).single();

  const { data: fr } = await db.from('friendships').select('*').or(`user_a.eq.${me},user_b.eq.${me}`);
  const otherOf = (f: { user_a: string; user_b: string }) => (f.user_a === me ? f.user_b : f.user_a);
  const acceptedIds = (fr ?? []).filter((f) => f.status === 'accepted').map(otherOf);
  const incomingIds = (fr ?? []).filter((f) => f.status === 'pending' && f.requested_by !== me).map(otherOf);
  const outgoingIds = (fr ?? []).filter((f) => f.status === 'pending' && f.requested_by === me).map(otherOf);

  // Défis où je participe
  const { data: myParts } = await db.from('challenge_participants').select('challenge_id, status').eq('user_id', me).neq('status', 'declined');
  const chIds = (myParts ?? []).map((p) => p.challenge_id);
  const { data: chs } = chIds.length
    ? await db.from('challenges').select('*').in('id', chIds).gte('ends_at', new Date(now - 14 * DAY).toISOString())
    : { data: [] };
  const { data: parts } = chIds.length ? await db.from('challenge_participants').select('*').in('challenge_id', chIds) : { data: [] };

  const people = [...new Set([me, ...acceptedIds, ...incomingIds, ...outgoingIds, ...(parts ?? []).map((p) => p.user_id)])];
  const { data: profiles } = await db.from('profiles').select('id, display_name, city, avatar_color').in('id', people);
  const nameOf = (id: string) => profiles?.find((p) => p.id === id)?.display_name || 'Coureur';
  const runs = await runsOf(db, [...new Set([me, ...acceptedIds, ...(parts ?? []).map((p) => p.user_id)])], now - 45 * DAY);

  const challenges: HubChallenge[] = [];
  for (const c of chs ?? []) {
    const t = CHALLENGES.find((x) => x.id === c.template_id);
    if (!t) continue;
    const start = new Date(c.starts_at).getTime();
    const end = new Date(c.ends_at).getTime();
    const ps = (parts ?? []).filter((p) => p.challenge_id === c.id);
    const accepted = ps.filter((p) => p.status === 'accepted');
    const board = leaderboard(
      t,
      accepted.map((p) => ({ userId: p.user_id, value: challengeValue(t, runs.get(p.user_id) ?? [], start, end) })),
    );

    // Défi terminé : on fige le résultat et on récompense les gagnants (une seule fois).
    if (end <= now && c.status === 'active') {
      await db.from('challenges').update({ status: 'finished' }).eq('id', c.id);
      for (const s of board) {
        const winner = t.mode === 'most' ? s.rank === 1 && s.value > 0 : s.done;
        await db.from('challenge_participants').update({ final_value: s.value, rewarded: winner }).eq('challenge_id', c.id).eq('user_id', s.userId);
        // Défis entre amis : XP uniquement, pas de RunCoins (évite les arrangements entre amis pour « farmer »).
      }
    }

    challenges.push({
      id: c.id,
      templateId: t.id,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      finished: end <= now,
      myStatus: myParts?.find((p) => p.challenge_id === c.id)?.status as HubChallenge['myStatus'],
      createdBy: { id: c.created_by, name: nameOf(c.created_by) },
      standings: board.map((s) => ({ ...s, name: s.userId === me ? 'Toi' : nameOf(s.userId), me: s.userId === me })),
      invited: ps.filter((p) => p.status === 'invited').map((p) => ({ id: p.user_id, name: nameOf(p.user_id) })),
    });
  }

  const goals = await friendGoals(db, acceptedIds);
  const card = (id: string) => {
    const p = profiles?.find((x) => x.id === id);
    const stats = periodStats(runs.get(id) ?? [], now);
    return {
      id,
      name: p?.display_name || 'Coureur',
      city: p?.city ?? null,
      color: p?.avatar_color ?? '#3A4BFF',
      ...stats,
      challenges: challenges.filter((c) => !c.finished && c.standings.some((s) => s.userId === id)).map((c) => c.templateId),
      goals: goals.get(id) ?? [],
    };
  };

  // Conversations : dernier message et non-lus
  const { data: myConvs } = await db.from('conversation_members').select('conversation_id, last_read_at').eq('user_id', me);
  const convIds = (myConvs ?? []).map((c) => c.conversation_id);
  const { data: members } = convIds.length ? await db.from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds) : { data: [] };
  const conversations: HubConversation[] = [];
  for (const c of myConvs ?? []) {
    const { data: last } = await db.from('messages').select('body, created_at, sender_id').eq('conversation_id', c.conversation_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const { count } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.conversation_id)
      .neq('sender_id', me)
      .gt('created_at', c.last_read_at);
    const other = (members ?? []).find((m) => m.conversation_id === c.conversation_id && m.user_id !== me)?.user_id;
    conversations.push({ id: c.conversation_id, with: other ? { id: other, name: nameOf(other) } : null, last, unread: count ?? 0 });
  }
  conversations.sort((a, b) => (b.last?.created_at ?? '').localeCompare(a.last?.created_at ?? ''));

  return {
    me: { id: me, name: profile?.display_name ?? null, friendCode: profile?.friend_code, city: profile?.city ?? null, ...periodStats(runs.get(me) ?? [], now) },
    friends: acceptedIds.map(card),
    incoming: incomingIds.map((id) => ({ id, name: nameOf(id) })),
    outgoing: outgoingIds.map((id) => ({ id, name: nameOf(id) })),
    challenges,
    conversations,
  };
}
