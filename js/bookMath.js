/** Stake book helpers — payout ints, deterministic paths, book entries. */

/** Float multiplier → RGS integer (0.1× → 10, 1.1× → 110, 120000× → 12000000). */
export function multToPayoutInt(mult) {
  return Math.round(mult * 100);
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic L/R path with exactly `rights` right moves (reproducible per book id). */
export function buildPathSeeded(rows, rights, seed) {
  const moves = Array.from({ length: rights }, () => 1).concat(
    Array.from({ length: rows - rights }, () => -1),
  );
  const rng = mulberry32(seed);
  for (let i = moves.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return moves;
}

export function simIdFromBucket(bucket, variant, pathsPerBucket) {
  return bucket * pathsPerBucket + variant + 1;
}

export function bucketVariantFromSimId(simId, pathsPerBucket) {
  const index = simId - 1;
  return {
    bucket: Math.floor(index / pathsPerBucket),
    variant: index % pathsPerBucket,
  };
}

/** Split each bucket probability evenly across path variants (sum = 1). */
export function expandBucketProbs(bucketProbs, pathsPerBucket) {
  return bucketProbs.flatMap((p) => Array(pathsPerBucket).fill(p / pathsPerBucket));
}

/**
 * One Stake book round — id matches lookup table simulation id.
 * @param {{ id: number, bucket: number, variant?: number, rows: number, paytable: number[] }} params
 */
export function createBook({ id, bucket, variant = 0, rows, paytable }) {
  const multiplier = paytable[bucket];
  const payoutMultiplier = multToPayoutInt(multiplier);
  const rights = bucket;
  const path = buildPathSeeded(rows, rights, id * 9973 + bucket * 131 + variant * 7919);

  return {
    id,
    payoutMultiplier,
    events: [
      {
        index: 0,
        type: 'plinkoDrop',
        bucket,
        variant,
        rights,
        path,
        rows,
      },
      {
        index: 1,
        type: 'setTotalWin',
        amount: payoutMultiplier,
      },
      {
        index: 2,
        type: 'finalWin',
        amount: payoutMultiplier,
      },
    ],
  };
}
