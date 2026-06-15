/**
 * Pure Plinko — single preset, no modes.
 * Paytable defines bucket multipliers; lookup weights (math-sdk) hit 96.05% RTP.
 * The board animation is performance only — not a fair binomial Galton board.
 */

export const GAME = {
  title: 'Pure Plinko',
  tagline: 'One drop. One result.',
  /** Peg rows (0..rows−1). Last row has rows+1 pegs; buckets = rows+1. */
  rows: 9,
  /** House edge 3.95% → RTP 96.05% (enforced in published lookup weights). */
  targetRtpPercent: 96.05,
  maxWinMult: 120_000,
};

/** Symmetric pays by distance d from nearest edge (d=0 → outermost bucket). */
export const BUCKET_LADDER = [120_000, 2000, 250, 7, 2, 1.1];
export const BUCKET_CENTER = 0.1;

/** Total return multipliers by bucket index (0 = far left, rows = far right). */
export function buildPaytable(rows = GAME.rows) {
  const buckets = rows + 1;
  /** Odd row counts → two middle buckets; even → one. Keeps centre at BUCKET_CENTER on narrow boards. */
  const innerCenterBuckets =
    rows % 2 === 1
      ? [Math.floor(rows / 2), Math.ceil(rows / 2)]
      : [rows / 2];
  const centerThreshold = Math.ceil(rows / 2);
  const mults = [];
  for (let k = 0; k < buckets; k += 1) {
    const d = Math.min(k, rows - k);
    if (innerCenterBuckets.includes(k) || d >= centerThreshold) {
      mults.push(BUCKET_CENTER);
    } else {
      mults.push(d < BUCKET_LADDER.length ? BUCKET_LADDER[d] : BUCKET_CENTER);
    }
  }
  return mults;
}

export const PAYTABLE = buildPaytable();

/** Distinct animation paths per bucket (same payout, split lookup weight). */
export const PATHS_PER_BUCKET = 3;

/** Visual ball size relative to default (2 = double). */
export const BALL = {
  sizeMultiplier: 2,
  /** Peg contact radius as a fraction of visual radius — scales with sizeMultiplier. */
  physicsToVisual: 0.225,
};

/** Bounce tuning — heightScale 0.35 = 35% of max formula height. */
export const BOUNCE = {
  heightScale: 0.35,
};

export const BET_OPTIONS = [1, 5, 10];
export const DEFAULT_BET = 1;
export const START_BALANCE = 1000;

/** Static game-info values per mode — do not change when switching modes in UI. */
export const GAME_INFO_MODES = [
  {
    key: 'base',
    label: 'Base',
    rtpPercent: GAME.targetRtpPercent,
    maxWinMult: GAME.maxWinMult,
  },
];

/**
 * Sample replay event IDs for Stake review (book sim ids at default $1.00 play).
 * @type {Record<string, { defaultBetApi: number, maxWin: { event: string, multiplier: number }, highPayout: { event: string, multiplier: number }, averagePayout: { event: string, multiplier: number } }>}
 */
export const REPLAY_REVIEW_EVENTS = {
  base: {
    defaultBetApi: 1_000_000,
    maxWin: { event: '1', multiplier: 120_000 },
    highPayout: { event: '4', multiplier: 2_000 },
    averagePayout: { event: '10', multiplier: 7 },
  },
};

export const COLORS = {
  bg: '#0a0c10',
  peg: '#3d4654',
  pegActive: '#6b7a90',
  ball: '#f8fafc',
  /** Bucket gradient — green at edges (0, rows), red at centre. HSL hues. */
  bucketHueEdge: 128,
  bucketHueCenter: 0,
  bucketGradSat: 58,
  bucketGradLight: 36,
  text: '#e8edf4',
  muted: '#8b97a8',
  accent: '#38bdf8',
};

/** Tune speed and bounce feel here. */
export const TIMING = {
  /** Ms per peg row at top → bottom (linear ramp). */
  startRowMs: 185,
  endRowMs: 205,
  /** Bounce height — 5 = maximum (uses full channel between peg rows). */
  bouncePop: 5,
  /** Frames per row — more = smoother bounce, slightly longer. */
  framesPerRow: 12,
  /** Bucket settle duration as a multiple of the final peg-row time. */
  settleDurationFactor: 1.2,
};
