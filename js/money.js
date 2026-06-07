/** Stake API money — 1_000_000 API units = $1.00 */
export const API_AMOUNT_MULTIPLIER = 1_000_000;

export function apiToDisplay(amount) {
  return amount / API_AMOUNT_MULTIPLIER;
}

export function displayToApi(amount) {
  return Math.round(amount * API_AMOUNT_MULTIPLIER);
}
