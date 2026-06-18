/**
 * Pure Plinko — burger menu modals.
 */

import { appendGeneralDisclaimer } from '@kap-solo/suki-engine/client/rgs.js';
import { GAME, GAME_INFO_MODES, PAYTABLE } from './config.js';
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

  function t(key, vars) {
    return game?.t?.(key, vars) ?? game?.copy?.term?.(key) ?? key;
  }

  modalHost.register('how-to-play', {
    title: 'How to Play',
    render(body) {
      const ul = document.createElement('ul');
      ul.innerHTML = `
        <li>${t('howToPlayBullet1')}</li>
        <li>${t('howToPlayBullet2')}</li>
        <li>${t('howToPlayBullet3')}</li>
      `;
      const intro = document.createElement('p');
      intro.innerHTML = t('howToPlayIntro', {
        betTerm: t('betAmount').toLowerCase(),
        drop: `<strong>${t('drop')}</strong>`,
      });
      body.append(intro, ul);
    },
  });

  modalHost.register('paytable', {
    title: 'Paytable',
    render(body) {
      const table = document.createElement('table');
      table.className = 'suki-modal-table';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr><th>${t('paytableBucketCol')}</th><th>${t('paytableMultiplierCol')}</th></tr>`;
      const tbody = document.createElement('tbody');
      for (let i = 0; i < PAYTABLE.length; i += 1) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>#${i}</td><td>${formatMult(PAYTABLE[i])}</td>`;
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      body.appendChild(table);

      const info = document.createElement('div');
      info.style.marginTop = '0.75rem';
      info.style.fontSize = '0.8rem';
      info.style.color = '#8b97a8';
      for (const mode of GAME_INFO_MODES) {
        const line = document.createElement('p');
        line.style.margin = '0.25rem 0';
        line.textContent = `${mode.label}: ${t('maxWinLabel')} ${formatMult(mode.maxWinMult)} · ${t('rtpLabel')} ${mode.rtpPercent}%`;
        info.appendChild(line);
      }
      const rounding = document.createElement('p');
      rounding.style.marginTop = '0.5rem';
      rounding.textContent = t('roundingNote');
      info.appendChild(rounding);
      appendGeneralDisclaimer(info, t);
      body.appendChild(info);
    },
  });

  modalHost.register('stats', {
    title: 'Session Stats',
    render(body) {
      const session = getSession();
      if (!session || !game?.controls?.showNetPosition) {
        const p = document.createElement('p');
        p.textContent = t('statsNotShown');
        body.appendChild(p);
        return;
      }
      const ul = document.createElement('ul');
      ul.style.margin = '0';
      ul.style.paddingLeft = '1.1rem';
      const rows = [
        [t('statsPlays'), String(session.plays)],
        [t('sessionPl'), formatCurrency(session.netProfit)],
        [
          t('statsBestWin'),
          session.highestWin > 0
            ? `${formatMult(session.highestMultiplier)} (${formatCurrency(session.highestWin)})`
            : '—',
        ],
        [t('statsAvgReturn'), `${sessionAvgReturnPercent(session).toFixed(2)}%`],
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
        t('recentResultsEmpty'),
      );
    },
  });
}
