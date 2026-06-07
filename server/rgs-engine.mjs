import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const API_MULT = 1_000_000;
const START_BALANCE_API = 1000 * API_MULT;

/** @type {Map<string, object>} */
const sessions = new Map();

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
    const session = getSession(sessionID);
    return success({
      balance: balanceObject(session),
      config: {
        minBet: 1 * API_MULT,
        maxBet: 1000 * API_MULT,
        stepBet: 1 * API_MULT,
        defaultBetLevel: 1 * API_MULT,
        betLevels: [1, 5, 10].map((d) => d * API_MULT),
        jurisdiction: {
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
        },
      },
      round: session.activeRound,
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
      return error('ERR_VAL', 'Round already active');
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
    round.active = false;
    session.activeRound = null;

    return success({ balance: balanceObject(session) });
  }

  return null;
}
