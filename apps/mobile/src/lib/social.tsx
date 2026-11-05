// Hub social : joueurs, défis, messages.
// Mode connecté : fonction serveur `hub` + table `messages` en temps réel.
// Mode démo : quelques joueurs fictifs (clairement signalés) pour tester toute l'expérience.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  challengeValue,
  CHALLENGES,
  leaderboard,
  periodStats,
  type HubChallenge,
  type HubMessage,
  type HubOverview,
  type HubPlayer,
  type RunRecord,
} from '@foulee/core';

import { useStore } from '@/lib/store';
import { callFunction, isDemo, supabase } from '@/lib/supabase';

const DAY = 86_400_000;
export const AVATAR_COLORS = ['#3A4BFF', '#FF6A2B', '#16C784', '#7B3FF2', '#FF3D6E', '#14A3C7'];

export type RunInvite = { date: string; time: string; place: string; distanceKm?: number };

interface SocialStore {
  overview: HubOverview | null;
  loading: boolean;
  refresh(): Promise<void>;
  setProfile(name: string, city?: string): Promise<void>;
  addFriend(code: string): Promise<'accepted' | 'pending' | 'not_found'>;
  respondFriend(userId: string, accept: boolean): Promise<void>;
  removeFriend(userId: string): Promise<void>;
  block(userId: string): Promise<void>;
  report(userId: string, reason: string, messageId?: string): Promise<void>;
  createChallenge(templateId: string, invitees: string[]): Promise<void>;
  respondChallenge(challengeId: string, accept: boolean): Promise<void>;
  openConversation(userId: string): Promise<string>;
  /** Messages d'une conversation (démo) ; en mode connecté, voir useConversation. */
  demoMessages: Record<string, HubMessage[]>;
  sendDemo(conversationId: string, msg: Omit<HubMessage, 'id' | 'createdAt' | 'senderId' | 'conversationId'>): void;
  markRead(conversationId: string): void;
  player(id: string): HubPlayer | undefined;
}

const Ctx = createContext<SocialStore | null>(null);

// ---------- Démo : joueurs fictifs ----------

interface DemoState {
  name: string | null;
  city: string | null;
  friends: Array<HubPlayer & { joinedAt: number }>;
  incoming: Array<{ id: string; name: string }>;
  challenges: Array<{ id: string; templateId: string; startsAt: number; createdBy: string; participants: Record<string, 'invited' | 'accepted' | 'declined'> }>;
  conversations: Record<string, { with: string; unread: number }>;
  messages: Record<string, HubMessage[]>;
}

const DEMO_KEY = 'foulee/social-demo/v2';
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function seedDemo(now: number): DemoState {
  const p = (id: string, name: string, city: string, color: string, km7: number, km30: number, runs30: number) => ({
    id,
    name,
    city,
    color,
    km7,
    km30,
    runs30,
    challenges: [] as string[],
    joinedAt: now,
  });
  return {
    name: null,
    city: null,
    friends: [
      { ...p('demo-lea', 'Léa', 'Lyon', '#FF3D6E', 24.6, 96.2, 14), goals: [{ title: 'Semi-marathon en 1:55:00', eventDate: inDays(53), done: 14, due: 15, total: 32 }] },
      { ...p('demo-karim', 'Karim', 'Paris', '#16C784', 31.2, 118.5, 17), goals: [{ title: '10 km de la Tour Eiffel · 42:30', eventDate: '2026-12-06', done: 11, due: 12, total: 16 }] },
      { ...p('demo-sophie', 'Sophie', 'Nantes', '#7B3FF2', 12.4, 52.8, 9), goals: [{ title: 'Finir : 10 km', eventDate: inDays(40), done: 4, due: 7, total: 18 }] },
    ],
    incoming: [{ id: 'demo-thomas', name: 'Thomas' }],
    challenges: [
      { id: 'dch1', templateId: 'duel7', startsAt: now - 3 * DAY, createdBy: 'demo-lea', participants: { me: 'accepted', 'demo-lea': 'accepted' } },
      { id: 'dch2', templateId: 'three', startsAt: now - 1 * DAY, createdBy: 'demo-karim', participants: { me: 'invited', 'demo-karim': 'accepted', 'demo-sophie': 'accepted' } },
    ],
    conversations: { 'dconv-lea': { with: 'demo-lea', unread: 1 } },
    messages: {
      'dconv-lea': [
        { id: 'm1', conversationId: 'dconv-lea', senderId: 'demo-lea', kind: 'text', body: 'Salut ! Prêt(e) pour notre duel ? J’ai déjà 9 km 😄', createdAt: new Date(now - 2 * DAY).toISOString() },
        { id: 'm2', conversationId: 'dconv-lea', senderId: 'me', kind: 'text', body: 'Tu vas voir, je rattrape ce week-end !', createdAt: new Date(now - 2 * DAY + 3600_000).toISOString() },
        {
          id: 'm3',
          conversationId: 'dconv-lea',
          senderId: 'demo-lea',
          kind: 'run_invite',
          body: 'On court ensemble samedi ?',
          payload: { date: 'Samedi', time: '09:30', place: 'Parc de la Tête d’Or, entrée principale', distanceKm: 10 },
          createdAt: new Date(now - 3 * 3600_000).toISOString(),
        },
      ],
    },
  };
}

/** Valeur simulée d'un joueur fictif dans un défi : il progresse régulièrement. */
function demoValue(p: HubPlayer, templateId: string, elapsedDays: number): number {
  const t = CHALLENGES.find((c) => c.id === templateId)!;
  const perDay = p.km30 / 30;
  if (t.metric === 'sessions') return Math.min(30, Math.round((p.runs30 / 30) * elapsedDays));
  if (t.metric === 'longest') return Math.round(Math.min(22, perDay * 4) * 10) / 10;
  return Math.round(perDay * elapsedDays * 10) / 10;
}

const DEMO_REPLIES = [
  'Carrément, bonne idée !',
  'Je suis chaud(e), on se tient au courant.',
  'Bien joué pour ta séance d’hier 💪',
  'Ça marche, à bientôt sur la route !',
];

export function SocialProvider({ children }: { children: ReactNode }) {
  const { plans, ready } = useStore();
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [server, setServer] = useState<HubOverview | null>(null);
  const [loading, setLoading] = useState(false);

  // Mes courses (démo) : séances validées dans mes plans.
  const myRuns: RunRecord[] = useMemo(
    () =>
      plans.flatMap((p) =>
        p.plan.sessions
          .filter((s) => ['validee', 'partielle'].includes(p.validations[s.id]?.status ?? ''))
          .map((s) => {
            const [y, m, d] = s.date.split('-').map(Number);
            return { startTime: new Date(y, m - 1, d, 18).getTime(), distanceM: s.distanceM * Math.min(1, p.validations[s.id].volumeScore || 1) };
          }),
      ),
    [plans],
  );

  useEffect(() => {
    if (!isDemo || !ready) return;
    AsyncStorage.getItem(DEMO_KEY)
      .then((raw) => setDemo(raw ? JSON.parse(raw) : seedDemo(Date.now())))
      .catch(() => setDemo(seedDemo(Date.now())));
  }, [ready]);
  useEffect(() => {
    if (demo) AsyncStorage.setItem(DEMO_KEY, JSON.stringify(demo)).catch(() => {});
  }, [demo]);

  const refresh = useCallback(async () => {
    if (isDemo) return;
    setLoading(true);
    try {
      setServer(await callFunction<HubOverview>('hub', { action: 'overview' }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDemo && ready) refresh().catch(() => {});
  }, [ready, refresh]);

  // ---------- Vue d'ensemble en démo, calculée comme le serveur ----------
  const demoOverview: HubOverview | null = useMemo(() => {
    if (!demo) return null;
    const now = Date.now();
    const nameOf = (id: string) => (id === 'me' ? 'Toi' : (demo.friends.find((f) => f.id === id)?.name ?? 'Coureur'));
    const challenges: HubChallenge[] = demo.challenges.map((c) => {
      const t = CHALLENGES.find((x) => x.id === c.templateId)!;
      const end = c.startsAt + t.durationDays * DAY;
      const elapsedDays = Math.min(t.durationDays, (now - c.startsAt) / DAY);
      const accepted = Object.entries(c.participants).filter(([, st]) => st === 'accepted');
      const board = leaderboard(
        t,
        accepted.map(([uid]) => ({
          userId: uid,
          value: uid === 'me' ? challengeValue(t, myRuns, c.startsAt, end) : demoValue(demo.friends.find((f) => f.id === uid)!, t.id, elapsedDays),
        })),
      );
      return {
        id: c.id,
        templateId: t.id,
        startsAt: new Date(c.startsAt).toISOString(),
        endsAt: new Date(end).toISOString(),
        finished: end <= now,
        myStatus: c.participants.me,
        createdBy: { id: c.createdBy, name: nameOf(c.createdBy) },
        standings: board.map((s) => ({ ...s, name: nameOf(s.userId), me: s.userId === 'me' })),
        invited: Object.entries(c.participants)
          .filter(([, st]) => st === 'invited')
          .map(([id]) => ({ id, name: nameOf(id) })),
      };
    });
    const mine = periodStats(myRuns, now);
    return {
      me: { id: 'me', name: demo.name, friendCode: 'FOU-DEMO', city: demo.city, ...mine },
      friends: demo.friends.map((f) => ({
        ...f,
        challenges: challenges.filter((c) => !c.finished && c.standings.some((s) => s.userId === f.id)).map((c) => c.templateId),
      })),
      incoming: demo.incoming,
      outgoing: [],
      challenges,
      conversations: Object.entries(demo.conversations).map(([id, c]) => {
        const last = demo.messages[id]?.at(-1);
        return {
          id,
          with: { id: c.with, name: nameOf(c.with) },
          last: last ? { body: last.body, created_at: last.createdAt, sender_id: last.senderId } : null,
          unread: c.unread,
        };
      }),
    };
  }, [demo, myRuns]);

  const overview = isDemo ? demoOverview : server;
  const upd = (f: (d: DemoState) => DemoState) => setDemo((d) => (d ? f(d) : d));

  const sendDemo: SocialStore['sendDemo'] = (conversationId, msg) => {
    const createdAt = new Date().toISOString();
    upd((d) => ({
      ...d,
      messages: { ...d.messages, [conversationId]: [...(d.messages[conversationId] ?? []), { ...msg, id: `m${Date.now()}`, conversationId, senderId: 'me', createdAt }] },
    }));
    // Réponse automatique du joueur fictif
    if (msg.kind === 'run_reply') return;
    setTimeout(() => {
      upd((d) => {
        const other = d.conversations[conversationId]?.with;
        if (!other) return d;
        const reply: HubMessage =
          msg.kind === 'run_invite'
            ? { id: `m${Date.now()}`, conversationId, senderId: other, kind: 'run_reply', body: 'Je viens !', payload: { answer: 'yes' }, createdAt: new Date().toISOString() }
            : { id: `m${Date.now()}`, conversationId, senderId: other, kind: 'text', body: DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)], createdAt: new Date().toISOString() };
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        return { ...d, messages: { ...d.messages, [conversationId]: [...(d.messages[conversationId] ?? []), reply] } };
      });
    }, 1800);
  };

  const value: SocialStore = {
    overview,
    loading,
    refresh,
    demoMessages: demo?.messages ?? {},
    sendDemo,
    player: (id) => overview?.friends.find((f) => f.id === id),
    markRead: (conversationId) => {
      if (isDemo) upd((d) => ({ ...d, conversations: { ...d.conversations, [conversationId]: { ...d.conversations[conversationId], unread: 0 } } }));
      else if (supabase)
        supabase.auth.getUser().then(({ data }) =>
          supabase!
            .from('conversation_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', data.user?.id ?? '')
            .then(() => {}),
        );
    },
    setProfile: async (name, city) => {
      if (isDemo) return upd((d) => ({ ...d, name, city: city ?? d.city }));
      await callFunction('hub', { action: 'set_profile', displayName: name, city });
      await refresh();
    },
    addFriend: async (code) => {
      const c = code.trim().toUpperCase();
      if (isDemo) {
        if (c.length < 4) return 'not_found';
        upd((d) => ({
          ...d,
          friends: [...d.friends, { id: `demo-${c}`, name: `Coureur ${c}`, city: null, color: AVATAR_COLORS[d.friends.length % AVATAR_COLORS.length], km7: 8.2, km30: 34.5, runs30: 6, challenges: [], joinedAt: Date.now() }],
        }));
        return 'accepted';
      }
      try {
        const r = await callFunction<{ status: 'accepted' | 'pending' }>('hub', { action: 'add_friend', code: c });
        await refresh();
        return r.status;
      } catch {
        return 'not_found';
      }
    },
    respondFriend: async (userId, accept) => {
      if (isDemo) {
        return upd((d) => {
          const inc = d.incoming.find((i) => i.id === userId);
          return {
            ...d,
            incoming: d.incoming.filter((i) => i.id !== userId),
            friends:
              accept && inc
                ? [...d.friends, { id: inc.id, name: inc.name, city: 'Bordeaux', color: '#14A3C7', km7: 18.9, km30: 71.3, runs30: 12, challenges: [], joinedAt: Date.now() }]
                : d.friends,
          };
        });
      }
      await callFunction('hub', { action: 'respond_friend', userId, accept });
      await refresh();
    },
    removeFriend: async (userId) => {
      if (isDemo) return upd((d) => ({ ...d, friends: d.friends.filter((f) => f.id !== userId) }));
      await callFunction('hub', { action: 'remove_friend', userId });
      await refresh();
    },
    block: async (userId) => {
      if (isDemo) return upd((d) => ({ ...d, friends: d.friends.filter((f) => f.id !== userId) }));
      await callFunction('hub', { action: 'block', userId });
      await refresh();
    },
    report: async (userId, reason, messageId) => {
      if (isDemo) return;
      await callFunction('hub', { action: 'report', userId, reason, messageId });
    },
    createChallenge: async (templateId, invitees) => {
      if (isDemo) {
        // En démo, les joueurs fictifs acceptent tout de suite.
        return upd((d) => ({
          ...d,
          challenges: [
            { id: `dch${Date.now()}`, templateId, startsAt: Date.now(), createdBy: 'me', participants: { me: 'accepted', ...Object.fromEntries(invitees.map((i) => [i, 'accepted' as const])) } },
            ...d.challenges,
          ],
        }));
      }
      await callFunction('hub', { action: 'create_challenge', templateId, invitees });
      await refresh();
    },
    respondChallenge: async (challengeId, accept) => {
      if (isDemo) {
        return upd((d) => ({
          ...d,
          challenges: d.challenges.map((c) => (c.id === challengeId ? { ...c, participants: { ...c.participants, me: accept ? 'accepted' : 'declined' } } : c)),
        }));
      }
      await callFunction('hub', { action: 'respond_challenge', challengeId, accept });
      await refresh();
    },
    openConversation: async (userId) => {
      if (isDemo) {
        const existing = Object.entries(demo?.conversations ?? {}).find(([, c]) => c.with === userId)?.[0];
        if (existing) return existing;
        const id = `dconv-${userId}`;
        upd((d) => ({ ...d, conversations: { ...d.conversations, [id]: { with: userId, unread: 0 } }, messages: { ...d.messages, [id]: [] } }));
        return id;
      }
      const { conversationId } = await callFunction<{ conversationId: string }>('hub', { action: 'open_conversation', userId });
      return conversationId;
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocial(): SocialStore {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSocial hors de SocialProvider');
  return s;
}

/** Messages d'une conversation en temps réel (mode connecté) ou locaux (démo). */
export function useConversation(conversationId: string) {
  const social = useSocial();
  const [serverMessages, setServerMessages] = useState<HubMessage[]>([]);
  const [myId, setMyId] = useState<string>('me');

  useEffect(() => {
    if (isDemo || !supabase) return;
    let active = true;
    const map = (m: Record<string, unknown>): HubMessage => ({
      id: m.id as string,
      conversationId: m.conversation_id as string,
      senderId: m.sender_id as string,
      kind: m.kind as HubMessage['kind'],
      body: m.body as string,
      payload: (m.payload as HubMessage['payload']) ?? null,
      createdAt: m.created_at as string,
    });
    supabase.auth.getUser().then(({ data }) => active && setMyId(data.user?.id ?? 'me'));
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at')
      .limit(200)
      .then(({ data }) => active && setServerMessages((data ?? []).map(map)));
    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        setServerMessages((list) => (list.some((x) => x.id === (payload.new as { id: string }).id) ? list : [...list, map(payload.new)]));
      })
      .subscribe();
    return () => {
      active = false;
      supabase?.removeChannel(channel);
    };
  }, [conversationId]);

  const messages = isDemo ? (social.demoMessages[conversationId] ?? []) : serverMessages;

  const send = async (msg: { kind: HubMessage['kind']; body: string; payload?: HubMessage['payload'] }) => {
    if (isDemo) return social.sendDemo(conversationId, msg);
    const { data } = await supabase!.auth.getUser();
    const { error } = await supabase!.from('messages').insert({ conversation_id: conversationId, sender_id: data.user!.id, kind: msg.kind, body: msg.body.slice(0, 1000), payload: msg.payload ?? null });
    if (error) throw error;
  };

  return { messages, myId, send };
}
