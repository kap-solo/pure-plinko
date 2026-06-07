const STORAGE_KEY = 'purePlinko.session';

export function createSession() {
  return {
    startedAt: Date.now(),
    plays: 0,
    totalBet: 0,
    totalPayout: 0,
    netProfit: 0,
    highestWin: 0,
    highestMultiplier: 0,
  };
}

/** @returns {object | null} */
export function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function ensureSession(existing) {
  return existing ?? createSession();
}

export function resetSession() {
  sessionStorage.removeItem(STORAGE_KEY);
  return null;
}

export function recordPlay(session, { bet, payout, multiplier }) {
  session.plays += 1;
  session.totalBet += bet;
  session.totalPayout += payout;
  session.netProfit += payout - bet;
  if (payout > session.highestWin) {
    session.highestWin = payout;
    session.highestMultiplier = multiplier;
  }
  return session;
}

/** Empirical return across the session (total returned ÷ total wagered). */
export function sessionAvgReturnPercent(session) {
  if (session.totalBet <= 0) return 0;
  return (session.totalPayout / session.totalBet) * 100;
}
