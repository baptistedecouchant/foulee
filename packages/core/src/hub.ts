// Types du Hub social, partagés entre l'app et le serveur.

import type { Standing } from './challenges.ts';

export interface HubPlayer {
  id: string;
  name: string;
  city: string | null;
  color: string;
  /** Photo de profil (facultative). */
  avatarUrl?: string | null;
  km7: number;
  km30: number;
  runs30: number;
  /** Identifiants des défis en cours auxquels il participe. */
  challenges: string[];
  /** Objectifs en cours et avancement (partagés entre amis uniquement). */
  goals?: FriendGoal[];
}

export interface FriendGoal {
  title: string;
  eventDate: string;
  /** Séances validées. */
  done: number;
  /** Séances prévues jusqu'à aujourd'hui. */
  due: number;
  /** Séances du plan. */
  total: number;
}

export interface HubChallenge {
  id: string;
  templateId: string;
  startsAt: string;
  endsAt: string;
  finished: boolean;
  myStatus?: 'invited' | 'accepted' | 'declined';
  createdBy: { id: string; name: string };
  standings: Array<Standing & { name: string; me: boolean }>;
  invited: Array<{ id: string; name: string }>;
}

export interface HubMessage {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'run_invite' | 'run_reply' | 'challenge';
  body: string;
  payload?: { date?: string; time?: string; place?: string; distanceKm?: number; answer?: 'yes' | 'no'; inviteId?: string } | null;
  createdAt: string;
}

export interface HubConversation {
  id: string;
  with: { id: string; name: string } | null;
  last: { body: string; created_at: string; sender_id: string } | null;
  unread: number;
}

export interface HubOverview {
  me: { id: string; name: string | null; friendCode?: string; city: string | null; avatarUrl?: string | null; km7: number; km30: number; runs30: number };
  friends: HubPlayer[];
  incoming: Array<{ id: string; name: string }>;
  outgoing: Array<{ id: string; name: string }>;
  challenges: HubChallenge[];
  conversations: HubConversation[];
}
