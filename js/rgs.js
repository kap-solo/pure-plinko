import { API_AMOUNT_MULTIPLIER } from './money.js';

const SESSION_ID_KEY = 'purePlinko.rgsSessionID';

export function getSessionID() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('sessionID');
  if (fromUrl) {
    sessionStorage.setItem(SESSION_ID_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(SESSION_ID_KEY) || 'local-demo';
}

/** New RGS session — fresh server balance on next authenticate. */
export function startNewRgsSession() {
  const sessionID = `local-${Date.now().toString(36)}`;
  sessionStorage.setItem(SESSION_ID_KEY, sessionID);
  const url = new URL(window.location.href);
  url.searchParams.set('sessionID', sessionID);
  history.replaceState(null, '', url);
  return sessionID;
}

/** @returns {{ rgsUrl: string, sessionID: string, language: string }} */
export function getRgsParams() {
  const params = new URLSearchParams(window.location.search);
  const rgsUrl = (params.get('rgs_url') || window.location.origin).replace(/\/$/, '');
  const sessionID = getSessionID();
  const language = params.get('lang') || 'en';
  return { rgsUrl, sessionID, language };
}

async function rgsPost(path, body) {
  const { rgsUrl } = getRgsParams();
  const response = await fetch(`${rgsUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const code = data.error?.code || data.error?.statusCode || `HTTP_${response.status}`;
    throw new Error(code);
  }
  return data;
}

export async function authenticate() {
  const { sessionID, language } = getRgsParams();
  return rgsPost('/wallet/authenticate', { sessionID, language });
}

export async function play({ amountApi, currency = 'USD', mode = 'BASE' }) {
  const { sessionID } = getRgsParams();
  return rgsPost('/wallet/play', {
    sessionID,
    amount: amountApi,
    currency,
    mode,
  });
}

export async function endRound() {
  const { sessionID } = getRgsParams();
  return rgsPost('/wallet/end-round', { sessionID });
}

/** Book payout int (×100) → Stake float multiplier on round. */
export function roundPayoutMultiplier(round) {
  if (typeof round.payoutMultiplier === 'number') return round.payoutMultiplier;
  return (round.payout ?? 0) / Math.max(1, round.amount ?? 1);
}

export function parsePlinkoDrop(round) {
  const events = round.state ?? [];
  const drop = events.find((e) => e.type === 'plinkoDrop');
  if (!drop) throw new Error('Missing plinkoDrop in round.state');
  return drop;
}

export { API_AMOUNT_MULTIPLIER };
