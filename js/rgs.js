import { API_AMOUNT_MULTIPLIER } from './money.js';
import { GAME_ID, REPLAY_VERSION, isReplayMode as isReplayModeConfig } from './stake/config.js';
import { getMockFlags } from './stake/config.js';

const SESSION_ID_KEY = 'purePlinko.rgsSessionID';

export const REPLAY_GAME = GAME_ID;
export { GAME_ID, REPLAY_VERSION };
export { isReplayMode } from './stake/config.js';
export { messageForRgsCode } from './stake/errors.js';

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

export { isDevMode } from './stake/config.js';

/** @returns {{ rgsUrl: string, sessionID: string, language: string, gameID: string }} */
export function getRgsParams() {
  const params = new URLSearchParams(window.location.search);
  const rgsUrl = (params.get('rgs_url') || window.location.origin).replace(/\/$/, '');
  const sessionID = getSessionID();
  const language = params.get('lang') || 'en';
  const gameID = params.get('gameID') || GAME_ID;
  return { rgsUrl, sessionID, language, gameID };
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
  const { sessionID, language, gameID } = getRgsParams();
  const body = { sessionID, language, gameID };
  const mock = getMockFlags();
  if (mock) body._mock = mock;
  return rgsPost('/wallet/authenticate', body);
}

export async function fetchBalance() {
  const { sessionID, gameID } = getRgsParams();
  const data = await rgsPost('/wallet/balance', { sessionID, gameID });
  return data.balance;
}

export async function play({ amountApi, currency = 'USD', mode = 'BASE' }) {
  const { sessionID, gameID } = getRgsParams();
  return rgsPost('/wallet/play', {
    sessionID,
    gameID,
    amount: amountApi,
    currency,
    mode,
  });
}

export async function endRound() {
  const { sessionID, gameID } = getRgsParams();
  return rgsPost('/wallet/end-round', { sessionID, gameID });
}

/** Track book event progress for RGS resume (skipped in replay mode). */
export async function reportBetEvent(eventIndex) {
  if (isReplayModeConfig()) return;
  const { sessionID, gameID } = getRgsParams();
  return rgsPost('/bet/event', { sessionID, gameID, event: String(eventIndex) });
}

/** @returns {{ game: string, version: string, mode: string, event: string, amountApi: number }} */
export function getReplayParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    game: params.get('game') || REPLAY_GAME,
    version: params.get('version') || REPLAY_VERSION,
    mode: (params.get('mode') || 'base').toLowerCase(),
    event: params.get('event') || '',
    amountApi: Number(params.get('amount')) || API_AMOUNT_MULTIPLIER,
  };
}

export function buildReplayUrl({ event, amountApi, mode = 'base' }) {
  const { rgsUrl } = getRgsParams();
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('replay', 'true');
  url.searchParams.set('rgs_url', rgsUrl);
  url.searchParams.set('game', REPLAY_GAME);
  url.searchParams.set('version', REPLAY_VERSION);
  url.searchParams.set('mode', mode.toLowerCase());
  url.searchParams.set('event', event);
  url.searchParams.set('amount', String(amountApi));
  return url.toString();
}

export async function requestReplay({ game, version, mode, event, amountApi }) {
  const { rgsUrl } = getRgsParams();
  const modePath = mode.toLowerCase();
  const amountQuery = amountApi ? `?amount=${amountApi}` : '';
  const response = await fetch(
    `${rgsUrl}/bet/replay/${game}/${version}/${modePath}/${encodeURIComponent(event)}${amountQuery}`,
  );
  const data = await response.json();
  if (!response.ok || data.error) {
    const code = data.error?.code || `HTTP_${response.status}`;
    throw new Error(code);
  }
  return data;
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
