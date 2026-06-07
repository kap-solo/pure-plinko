# Pure Plinko (working title)

Minimal high-volatility Plinko prototype — lottery-ticket logic, no story wrapper.

## Run locally

Double-click `start.bat` (starts Node mock RGS + opens the browser) or:

```bat
cd C:\Vibecoding_GH\Pure-Plinko
npm install
npm start
```

| URL | Mode |
|-----|------|
| `http://127.0.0.1:5174/?dev=true` | Local dev — mock RGS, test buttons (100 play, new session) |
| `http://127.0.0.1:5174/` | Hosted demo — playable mock RGS, no dev UI |

**Suki Engine** is pinned in `package.json` to a specific commit (`dbc79c8`, …). After bumping the hash, run `npm install` and `npm run test:smoke`.

## What “pure” means (v0)

| Included | Stripped out |
|----------|----------------|
| One **Drop** button | Row / risk settings |
| Fixed **17-row** board | Bonus rounds, buy features |
| Paytable on screen | Narrative UI, tutorials |
| 3 bet chips ($1 / $5 / $10) | Autoplay, turbo menus |
| Outcome-first drop (Stake-shaped) | RGS / real money |

## Math (prototype)

- **17 rows → 18 buckets** (fixed preset).
- Bucket weights = **binomial** (fair Galton board).
- Edge buckets: **120,000×** return.
- Near-edge: **0.2×** on a thin band; most interior: **0×**.
- Displayed RTP uses binomial weights + this paytable (~92% with current table).

For **96% RTP at 120,000×** on a fair board, edge hits are so rare that tuning is a math-sdk job (slightly higher interior dribbles or lookup weight adjustments). See `js/config.js`.

## Stake path

1. Port paytable + events to `math-sdk/games/pure_plinko`.
2. Frontend: book event `drop` → animate path → `setTotalWin`.
3. Replace `pickBucket()` with `/wallet/play` response.
4. Swap canvas art in `assets/` (your design pass).

## Assets

Add optional art under `assets/` — board frame, ball sprite, bucket labels. Wire paths in `js/config.js` when ready.
