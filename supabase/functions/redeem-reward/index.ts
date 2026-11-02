import { adminClient, handle, HttpError, json, requireAppIntegrity, requireUser } from '../_shared/supabase.ts';

const ERRORS: Record<string, number> = {
  insufficient_points: 409,
  out_of_stock: 409,
  reward_unavailable: 404,
  rewards_suspended: 403,
};

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    await requireAppIntegrity(req);
    const { rewardId } = await req.json();
    if (typeof rewardId !== 'string') throw new HttpError(400, 'invalid_reward');

    // Toute la logique (solde, stock, verrou anti double-dépense) est dans la fonction SQL.
    const { data, error } = await adminClient().rpc('redeem_reward', { p_user: user.id, p_reward: rewardId });
    if (error) {
      const code = Object.keys(ERRORS).find((k) => error.message.includes(k));
      if (code) throw new HttpError(ERRORS[code], code);
      throw error;
    }
    return json({ redemptionId: data[0].redemption_id, code: data[0].code });
  }),
);
