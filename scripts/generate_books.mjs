/**
 * Generate Stake math bundle: books_base.jsonl.zst, lookUpTable_base_0.csv, index.json
 *
 * Prerequisite: node scripts/tune_weights.mjs
 * Usage: node scripts/generate_books.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bucketVariantFromSimId, createBook } from '../js/bookMath.js';
import { GAME, PATHS_PER_BUCKET, PAYTABLE } from '../js/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');
const zlib = await import('node:zlib');
const zstdCompress = promisify(zlib.zstdCompress);

mkdirSync(dataDir, { recursive: true });

const booksJsonl = join(dataDir, 'books_base.jsonl');
const booksZst = join(dataDir, 'books_base.jsonl.zst');
const lutPath = join(dataDir, 'lookUpTable_base_0.csv');
const indexPath = join(dataDir, 'index.json');

if (!readFileSync(lutPath, 'utf8').includes('payout_multiplier')) {
  throw new Error('Missing lookup table — run: node scripts/tune_weights.mjs');
}

const lines = readFileSync(lutPath, 'utf8').trim().split('\n').slice(1);
const books = lines.map((line) => {
  const [idStr, , payoutStr] = line.split(',');
  const id = Number(idStr);
  const { bucket, variant } = bucketVariantFromSimId(id, PATHS_PER_BUCKET);
  if (bucket < 0 || bucket >= PAYTABLE.length) {
    throw new Error(`Invalid simulation id ${id} in lookup table`);
  }
  const book = createBook({
    id,
    bucket,
    variant,
    rows: GAME.rows,
    paytable: PAYTABLE,
  });
  if (book.payoutMultiplier !== Number(payoutStr)) {
    throw new Error(
      `Payout mismatch sim ${id}: book ${book.payoutMultiplier} vs LUT ${payoutStr}`,
    );
  }
  return book;
});

writeFileSync(booksJsonl, `${books.map((b) => JSON.stringify(b)).join('\n')}\n`);

const raw = readFileSync(booksJsonl);
const compressed = await zstdCompress(raw);
writeFileSync(booksZst, compressed);

writeFileSync(
  indexPath,
  `${JSON.stringify(
    {
      modes: [
        {
          name: 'base',
          cost: 1.0,
          events: 'books_base.jsonl.zst',
          weights: 'lookUpTable_base_0.csv',
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Books: ${books.length} simulations (${PATHS_PER_BUCKET} paths × ${PAYTABLE.length} buckets)`,
);
console.log(`Wrote ${booksJsonl}`);
console.log(`Wrote ${booksZst} (${compressed.length} bytes)`);
console.log(`Wrote ${indexPath}`);
console.log('Sample book (sim 1):', JSON.stringify(books[0], null, 2));
