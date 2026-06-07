import { roundPayoutMultiplier } from '@kap-solo/suki-engine/client/rgs.js';

export function parsePlinkoDrop(round) {
  const events = round.state ?? [];
  const drop = events.find((e) => e.type === 'plinkoDrop');
  if (!drop) throw new Error('Missing plinkoDrop in round.state');
  return drop;
}

export function buildPlinkoSettledResult(round) {
  const drop = parsePlinkoDrop(round);
  const multiplier = roundPayoutMultiplier(round);
  return {
    bucket: drop.bucket,
    multiplier,
    payoutApi: round.payout,
    profitApi: round.payout - round.amount,
  };
}
