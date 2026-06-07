import { GAME, PAYTABLE } from './config.js';
import { LOOKUP_PROBS } from './weights.js';

/** @returns {number[]} Tuned lookup probabilities (sum = 1). */
export function lookupProbabilities() {
  return LOOKUP_PROBS;
}

/** @returns {number[]} Fair binomial shape (visual reference only). */
export function binomialProbabilities(rows = GAME.rows) {
  const n = 2 ** rows;
  const probs = [];
  for (let k = 0; k <= rows; k += 1) {
    probs.push(binomial(rows, k) / n);
  }
  return probs;
}

/** @deprecated Use lookupProbabilities — kept as alias for HUD helpers. */
export function bucketProbabilities(rows = GAME.rows) {
  return lookupProbabilities();
}

function binomial(n, k) {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i += 1) {
    c = (c * (n - i)) / (i + 1);
  }
  return c;
}

/** @returns {{ rtpPercent: number, maxWin: number }} */
export function summarizePaytable(paytable = PAYTABLE, probs = bucketProbabilities()) {
  let expected = 0;
  let maxWin = 0;
  for (let i = 0; i < paytable.length; i += 1) {
    expected += probs[i] * paytable[i];
    maxWin = Math.max(maxWin, paytable[i]);
  }
  return { rtpPercent: expected * 100, maxWin };
}

/** Weighted bucket pick from published lookup table (prototype RNG). */
export function pickBucket(rows = GAME.rows, paytable = PAYTABLE) {
  const probs = lookupProbabilities();
  let r = Math.random();
  for (let k = 0; k <= rows; k += 1) {
    r -= probs[k];
    if (r <= 0) {
      return {
        bucket: k,
        multiplier: paytable[k],
        rights: k,
      };
    }
  }
  return { bucket: rows, multiplier: paytable[rows], rights: rows };
}

/** Random L/R path with exactly `rights` right moves. */
export function buildPath(rows, rights) {
  const moves = Array.from({ length: rights }, () => 1).concat(
    Array.from({ length: rows - rights }, () => -1),
  );
  for (let i = moves.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  return moves;
}

export function formatMult(mult) {
  if (mult >= 1000) return `${Math.round(mult).toLocaleString()}×`;
  if (mult >= 10) return `${mult.toFixed(0)}×`;
  if (mult >= 1) return `${mult.toFixed(1)}×`;
  if (mult === 0) return '0×';
  return `${mult.toFixed(1)}×`;
}

export function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}
