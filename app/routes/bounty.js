import {
  el, clear, apiGet, errorView, loadingView, fmtNum, fmtUsd, fmtDate, timeLeft, phaseOf, statusLabel,
  slugOf, renderMarkdown, setShotReady, pageHead,
} from '../common.js';

function rewardsRows(rewards, feeShare = {}) {
  if (!rewards || typeof rewards !== 'object') return [];
  return Object.entries(rewards).map(([place, amount]) => [Number(place), Number(amount)])
    .filter(([place, amount]) => Number.isFinite(place) && Number.isFinite(amount))
    .sort((a, b) => a[0] - b[0])
    .map(([place, amount]) => ({ place, amount, share: Number(feeShare?.[place] || 0) }));
}

function statusPill(item, now) {
  const phase = phaseOf(item, now);
  return el('span', { class: `status ${phase}` }, statusLabel(item, now));
}

function rewardsStrip(item) {
  const rewards = rewardsRows(item.rewards);
  const places = rewards.length;
  const max = rewards.length ? Math.max(...rewards.map((r) => r.amount)) : null;
  const fee = Number(item.entryFeeUsd);
  return el('section', { class: 'rewards-strip', 'aria-label': 'Rewards summary' },
    el('div', { class: 'reward-cell primary' },
      el('small', {}, 'Live pot'), el('b', {}, fmtUsd(item.potUsd ?? item.rewardAmount))),
    el('div', { class: 'reward-cell' }, el('small', {}, 'Deadline'), el('b', { style: 'font-size:16px' }, fmtDate(item.deadline))),
    el('div', { class: 'reward-cell' }, el('small', {}, 'Published reward'), el('b', {}, fmtUsd(item.rewardAmount))),
    el('div', { class: 'reward-cell' }, el('small', {}, 'Top prize'), el('b', {}, max === null ? '—' : fmtUsd(max))),
    el('div', { class: 'reward-cell' }, el('small', {}, 'Paid places'), el('b', {}, places ? String(places) : '—')),
    el('div', { class: 'reward-cell' }, el('small', {}, 'Entry fee'), el('b', {}, Number.isFinite(fee) ? fmtUsd(fee) : 'Free')));
}

function phasesTable(item) {
  if (!Array.isArray(item.phases) || !item.phases.length) return el('p', { class: 'meta' }, 'No phases published.');
  return el('div', {},
    el('div', { class: 'disc-title' }, el('strong', {}, 'Phase'), el('span', {}, 'Window')),
    ...item.phases.map((p) => el('div', { class: 'disc-title' },
      el('span', {}, el('b', { style: 'font-weight:650' }, String(p?.title || p?.key || 'Phase')), p?.description ? el('div', { class: 'meta' }, String(p.description)) : null),
      el('span', {}, `${fmtDate(p?.startsAt, true)} — ${p?.endsAt ? fmtDate(p.endsAt, true) : 'open'}`))));
}

function prizeTable(item) {
  const rows = rewardsRows(item.rewards);
  if (!rows.length) return el('p', { class: 'meta' }, 'No place rewards published.');
  return el('table', { class: 'slim-table' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Place'), el('th', { class: 'right' }, 'Base'), el('th', { class: 'right' }, 'Fee share'), el('th', { class: 'right' }, 'Amount'))),
    el('tbody', {}, ...rows.map((r) => {
      const live = Array.isArray(item.rewardsNow) ? item.rewardsNow.find((x) => Number(x?.place) === r.place) : null;
      return el('tr', {},
        el('td', {}, el('span', { class: `place ${r.place === 1 ? 'first' : ''}` }, String(r.place))),
        el('td', { class: 'right mono' }, fmtUsd(r.amount)),
        el('td', { class: 'right mono' }, fmtUsd(r.share || 0)),
        el('td', { class: 'right mono' }, live?.amountUsd ? fmtUsd(live.amountUsd) : '—'));
    })));
}

function breadcrumb(title) {
  return el('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' },
    el('a', { href: '#/' }, 'Board'), el('span', {}, 'Bounty'), el('span', { 'aria-current': 'page' }, title));
}

function bodyView(root, item, at) {
  const now = Date.now();
  const slug = slugOf(item.slug) || '';
  const phase = phaseOf(item, now);
  const fee = Number(item.entryFeeUsd);
  const pot = Number(item.potUsd ?? item.rewardAmount);
  const paidEntries = Number(item.entryFeePayers);
  const title = typeof item.title === 'string' ? item.title : slug;
  document.title = `${title} · FIELDNOTES / make.fun`;
  const rules = typeof item.rules === 'string' && item.rules.trim() ? item.rules : item.description;
  const rewardNote = Number(item.entryFeeUsd) > 0 && Number(item.entryFeePayers) > 0
    ? 'Live fee shares can change as entry fees are paid. All values are API-reported, not estimates.'
    : 'Place amounts are published rewards. No returns are implied beyond these terms.';
  const nodes = [
    pageHead(at),
    breadcrumb(title),
    el('header', { class: 'bounty-hero' },
      el('div', { class: 'kicker' }, `${item.category || 'Bounty'} · ${item.sponsor?.name || 'make.fun'}${item.sponsor?.isVerified ? ' · verified sponsor' : ''}`),
      el('h1', {}, title),
      el('div', { class: 'hero-meta' },
        statusPill(item, now),
        el('span', {}, phase === 'upcoming' ? `Opens ${fmtDate(item.opensAt, true)}` : `Deadline ${fmtDate(item.deadline, true)}`),
        el('span', { class: 'num', ...(item.deadline ? { 'data-deadline': item.deadline } : {}) }, phase === 'upcoming' ? `opens in ${timeLeft(item.opensAt)}` : timeLeft(item.deadline)),
        el('span', { class: 'num' }, `${fmtNum(item.submissionCount)} entries`))),
    rewardsStrip(item),
    el('div', { class: 'detail-grid' },
      el('div', {},
        el('div', { class: 'section-head', style: 'padding-top:0' }, el('h2', {}, 'The brief')),
        renderMarkdown(item.summary || item.description),
        el('div', { style: 'margin-top:28px;border-top:1px solid var(--ink);padding-top:0' },
          el('details', { open: true }, el('summary', {}, 'Full rules'),
            el('div', {}, renderMarkdown(rules))),
          el('details', {}, el('summary', {}, 'Phases & schedule'), el('div', {}, phasesTable(item))),
          el('details', {}, el('summary', {}, 'Rewards by place'), el('div', {}, prizeTable(item), el('p', { class: 'meta', style: 'margin-top:12px' }, rewardNote))),
          item.rulesNote ? el('details', {}, el('summary', {}, 'Rules note'), el('div', {}, renderMarkdown(item.rulesNote))) : null)),
      el('aside', { class: 'side-panel' },
        el('section', {}, el('h3', {}, 'Bounty record'),
          el('dl', {},
            kv('Status', statusLabel(item, now)),
            kv('Opens', fmtDate(item.opensAt, true)),
            kv('Deadline', fmtDate(item.deadline, true)),
            kv('Time left', phase === 'closed' ? 'Ended' : timeLeft(item.deadline)),
            kv('Entries', fmtNum(item.submissionCount)),
            kv('Paid entries', Number.isFinite(paidEntries) ? fmtNum(paidEntries) : '—'),
            kv('Entry fee', Number.isFinite(fee) ? fmtUsd(fee) : 'Free'),
            kv('Pot', fmtUsd(pot)))),
        el('section', {}, el('h3', {}, 'Sponsor'),
          el('p', { style: 'margin:0;font-size:13px' }, item.sponsor?.name || 'make.fun'),
          item.sponsor?.isVerified ? el('span', { class: 'meta' }, 'Verified sponsor') : null,
          Array.isArray(item.skills) && item.skills.length ? el('div', { class: 'meta', style: 'margin-top:8px' }, `Skills · ${item.skills.join(', ')}`) : null),
        el('div', { class: 'cta-box' },
          el('h3', {}, 'Follow the ledger.'),
          el('p', {}, 'See every entrant and the current ranking. Provisional scores can move.'),
          el('a', { class: 'btn', href: `#/leaderboard/${encodeURIComponent(slug)}` }, 'Open leaderboard →')),
        el('p', { class: 'hash-foot' }, 'Source: make.fun public API · read-only'))),
  ];
  clear(root, ...nodes);
  setShotReady(true);
}

function kv(label, value) {
  return el('div', { class: 'kv' }, el('dt', {}, label), el('dd', {}, value));
}

export async function render({ root, parts, signal, isCurrent }) {
  const slug = slugOf(parts[0]);
  document.title = 'Bounty · FIELDNOTES / make.fun';
  clear(root, loadingView('Loading bounty record'));
  if (!slug) {
    clear(root, errorView({ status: 404, message: 'That bounty slug is not valid.' }, () => { location.hash = '#/'; }));
    setShotReady(true); return;
  }
  try {
    const result = await apiGet(`competitions/${encodeURIComponent(slug)}`, { signal });
    if (!isCurrent()) return;
    if (!result.data || typeof result.data !== 'object') throw new Error('The bounty record was empty.');
    bodyView(root, { ...result.data, slug: slugOf(result.data.slug) || slug }, result.at);
  } catch (error) {
    if (error?.name === 'AbortError' || !isCurrent()) return;
    clear(root, pageHead(null), breadcrumb('Unavailable'), errorView(error, () => location.reload()));
    setShotReady(true);
  }
}
