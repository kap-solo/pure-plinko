/**
 * Pure Plinko — burger menu modals.
 */

import { GAME, PAYTABLE } from './config.js';
import { formatMult } from './math.js';
import { sessionAvgReturnPercent } from './session.js';

/**
 * @param {object} ctx
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createModalHost>} ctx.modalHost
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createRecentResultsStore>} ctx.recentResults
 * @param {object} ctx.game
 * @param {() => string} ctx.formatCurrency
 * @param {() => object | null} ctx.getSession
 */
export function registerPlinkoModals(ctx) {
  const { modalHost, recentResults, game, formatCurrency, getSession } = ctx;

  modalHost.register('how-to-play', {
    title: 'How to Play',
    render(body) {
      body.innerHTML = `
        <p>Choose a bet and press <strong>Drop</strong>. One ball, one bucket — the payout is decided before the animation runs.</p>
        <ul>
          <li>No row picker or risk sliders — single preset only.</li>
          <li>Paytable is always visible under the board.</li>
          <li>Spacebar drops when allowed by jurisdiction.</li>
        </ul>
      `;
    },
  });

  modalHost.register('paytable', {
    title: 'Paytable',
    render(body) {
      const table = document.createElement('table');
      table.className = 'suki-modal-table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Bucket</th><th>Multiplier</th></tr>';
      const tbody = document.createElement('tbody');
      for (let i = 0; i < PAYTABLE.length; i += 1) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>#${i}</td><td>${formatMult(PAYTABLE[i])}</td>`;
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      body.appendChild(table);
      if (game?.controls?.showRtp) {
        const rtp = document.createElement('p');
        rtp.style.marginTop = '0.75rem';
        rtp.style.fontSize = '0.8rem';
        rtp.style.color = '#8b97a8';
        rtp.textContent = `Target RTP ${GAME.targetRtpPercent}% · ${GAME.rows} rows`;
        body.appendChild(rtp);
      }
    },
  });

  modalHost.register('stats', {
    title: 'Session Stats',
    render(body) {
      const session = getSession();
      if (!session || !game?.controls?.showNetPosition) {
        const p = document.createElement('p');
        p.textContent = 'Session stats are not shown for this jurisdiction.';
        body.appendChild(p);
        return;
      }
      const ul = document.createElement('ul');
      ul.style.margin = '0';
      ul.style.paddingLeft = '1.1rem';
      const rows = [
        ['Plays', String(session.plays)],
        ['Session P/L', formatCurrency(session.netProfit)],
        [
          'Best win',
          session.highestWin > 0
            ? `${formatMult(session.highestMultiplier)} (${formatCurrency(session.highestWin)})`
            : '—',
        ],
        ['Avg return', `${sessionAvgReturnPercent(session).toFixed(2)}%`],
      ];
      for (const [label, value] of rows) {
        const li = document.createElement('li');
        li.textContent = `${label}: ${value}`;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    },
  });

  modalHost.register('recent-results', {
    title: 'Recent Results',
    render(body) {
      recentResults.renderList(
        body,
        (entry) => {
          const d = entry.data ?? entry;
          const mult = d.multiplier != null ? formatMult(d.multiplier) : '—';
          const payout = d.payout != null ? formatCurrency(d.payout) : '—';
          const bucket = d.bucket != null ? `#${d.bucket}` : '—';
          return `${bucket} · ${mult} → ${payout}`;
        },
        'No drops yet — play to populate history.',
      );
    },
  });
}
