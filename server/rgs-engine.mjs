import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const API_MULT = 1_000_000;
const START_BALANCE_API = 1000 * API_MULT;

/** @type {Map<string, object>} */
const sessions = new Map();

/** @type {Map<string, object>} */
const replayStore = new Map();

const GAME_ID = 'pure-plinko';
const REPLAY_GAME = GAME_ID;
const REPLAY_VERSION = '1';

const JURISDICTION_MOCK = {
  strict: {
    disabledTurbo: true,
    disabledSuperTurbo: true,
    disabledAutoplay: true,
    disabledSpacebar: true,
    disabledSlamstop: true,
    displayNetPosition: false,
    displayRTP: false,
    minimumRoundDuration: 2500,
  },
};

const DEFAULT_JURISDICTION = {
  socialCasino: false,
  disabledFullscreen: false,
  disabledTurbo: false,
  disabledSuperTurbo: false,
  disabledAutoplay: false,
  disabledSlamstop: false,
  disabledSpacebar: false,
  disabledBuyFeature: true,
  displayNetPosition: true,
  displayRTP: true,
  displaySessionTimer: false,
  minimumRoundDuration: 0,
};

function loadLookup() {
  const text = readFileSync(join(root, 'data/lookUpTable_base_0.csv'), 'utf8');
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [id, weight, payout] = line.split(',');
      return { id: Number(id), weight: Number(weight), payout: Number(payout) };
    });
}

function loadBooks() {
  const text = readFileSync(join(root, 'data/books_base.jsonl'), 'utf8');
  /** @type {Map<number, object>} */
  const books = new Map();
  for (const line of text.trim().split('\n')) {
    if (!line) continue;
    const book = JSON.parse(line);
    books.set(book.id, book);
  }
  return books;
}

const lookup = loadLookup();
const books = loadBooks();
const weightTotal = lookup.reduce((sum, row) => sum + row.weight, 0);

function pickSimulationId() {
  let r = Math.random() * weightTotal;
  for (const row of lookup) {
    r -= row.weight;
    if (r <= 0) return row.id;
  }
  return lookup[lookup.length - 1].id;
}

function getSession(sessionID) {
  if (!sessions.has(sessionID)) {
    sessions.set(sessionID, {
      balance: START_BALANCE_API,
      currency: 'USD',
      roundID: 0,
      activeRound: null,
      lastCompletedRound: null,
      lastEvent: null,
    });
  }
  return sessions.get(sessionID);
}

function balanceObject(session) {
  return { amount: session.balance, currency: session.currency };
}

function success(body) {
  return { status: { statusCode: 'SUCCESS' }, ...body };
}

function error(code, message) {
  return { error: { code, message } };
}

export function handleRgsRequest(pathname, body) {
  const sessionID = body?.sessionID || 'local-demo';

  if (pathname === '/wallet/authenticate') {
    if (body?._mock?.err_is) {
      return error('ERR_IS', 'Mock session expired');
    }

    const session = getSession(sessionID);
    const jurisdiction = { ...DEFAULT_JURISDICTION };
    const mockProfile = body?._mock?.jurisdiction;
    if (mockProfile && JURISDICTION_MOCK[mockProfile]) {
      Object.assign(jurisdiction, JURISDICTION_MOCK[mockProfile]);
    }

    const round = session.activeRound ?? session.lastCompletedRound ?? null;

    return success({
      balance: balanceObject(session),
      config: {
        gameID: GAME_ID,
        minBet: 1 * API_MULT,
        maxBet: 1000 * API_MULT,
        stepBet: 1 * API_MULT,
        defaultBetLevel: 1 * API_MULT,
        betLevels: [1, 5, 10].map((d) => d * API_MULT),
        jurisdiction,
      },
      round,
      meta: { lastEvent: session.lastEvent },
    });
  }

  if (pathname === '/wallet/balance') {
    const session = getSession(sessionID);
    return success({ balance: balanceObject(session) });
  }

  if (pathname === '/wallet/play') {
    const session = getSession(sessionID);
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return error('ERR_VAL', 'Invalid bet amount');
    }
    if (session.activeRound?.active) {
      return error('ERR_BE', 'Round already active');
    }
    if (session.balance < amount) {
      return error('ERR_IPB', 'Insufficient balance');
    }

    const simId = pickSimulationId();
    const book = books.get(simId);
    if (!book) {
      return error('ERR_GEN', `Missing book ${simId}`);
    }

    session.balance -= amount;
    const payoutMultiplier = book.payoutMultiplier / 100;
    const payout = Math.round(amount * payoutMultiplier);

    session.roundID += 1;
    session.activeRound = {
      roundID: session.roundID,
      amount,
      payout,
      payoutMultiplier,
      active: true,
      mode: body.mode || 'BASE',
      state: book.events,
    };

    return success({
      balance: balanceObject(session),
      round: session.activeRound,
    });
  }

  if (pathname === '/wallet/end-round') {
    const session = getSession(sessionID);
    const round = session.activeRound;
    if (!round?.active) {
      return success({ balance: balanceObject(session) });
    }

    session.balance += round.payout;
    const replayEvent = storeReplayRound(sessionID, round);
    round.active = false;
    session.lastCompletedRound = {
      roundID: round.roundID,
      amount: round.amount,
      payout: round.payout,
      payoutMultiplier: round.payoutMultiplier,
      active: false,
      mode: round.mode,
      state: round.state,
    };
    session.lastEvent = null;
    session.activeRound = null;

    return success({ balance: balanceObject(session), replayEvent });
  }

  return null;
}

export function handleBetEvent(body) {
  const sessionID = body?.sessionID || 'local-demo';
  const event = body?.event;
  if (event === undefined || event === null || event === '') {
    return error('ERR_VAL', 'Missing event');
  }
  const session = getSession(sessionID);
  session.lastEvent = String(event);
  return success({ event: String(event) });
}

function storeReplayRound(sessionID, round) {
  const event = `${sessionID}-${round.roundID}`;
  replayStore.set(event, {
    game: REPLAY_GAME,
    version: REPLAY_VERSION,
    mode: 'base',
    round: {
      amount: round.amount,
      payout: round.payout,
      payoutMultiplier: round.payoutMultiplier,
      active: false,
      mode: round.mode || 'BASE',
      state: round.state,
    },
  });
  return event;
}

function roundFromBook(book, amountApi) {
  const payoutMultiplier = book.payoutMultiplier / 100;
  const payout = Math.round(amountApi * payoutMultiplier);
  return {
    amount: amountApi,
    payout,
    payoutMultiplier,
    active: false,
    mode: 'BASE',
    state: book.events,
  };
}

/** @param {string | null} amountQuery API amount from ?amount= on replay GET */
export function handleReplayRequest(game, version, mode, event, amountQuery) {
  const modeNorm = String(mode || '').toLowerCase();
  if (game !== REPLAY_GAME || version !== REPLAY_VERSION || modeNorm !== 'base') {
    return error('ERR_VAL', 'Invalid replay route');
  }
  if (!event) {
    return error('ERR_VAL', 'Missing replay event');
  }

  const stored = replayStore.get(event);
  if (stored) {
    return success({ round: stored.round });
  }

  const bookId = Number(event);
  if (Number.isFinite(bookId) && books.has(bookId)) {
    const amountApi = Number(amountQuery) || API_MULT;
    if (!Number.isFinite(amountApi) || amountApi <= 0) {
      return error('ERR_VAL', 'Invalid replay amount');
    }
    return success({ round: roundFromBook(books.get(bookId), amountApi) });
  }

  return error('ERR_BNF', 'Replay not found');
}
