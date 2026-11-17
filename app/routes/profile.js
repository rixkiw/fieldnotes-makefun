import {
  el, clear, apiGet, errorView, loadingView, fmtNum, fmtUsd, fmtDate, handleOf, slugOf,
  readParams, updateParams, setShotReady, pageHead, avatarNode, renderMarkdown,
} from '../common.js';

function stat(value, label) {
  return el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
}

const PAGE_SIZE = 10;

function solutionsNode(record, state, setPage) {
  const all = Array.isArray(record.solutions) ? record.solutions.filter((s) => s && typeof s === 'object') : [];
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, state.page), pages);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const result = [el('div', { class: 'section-head', style: 'padding-top:0' }, el('h2', {}, 'Solution ledger'), el('p', {}, `${fmtNum(all.length)} returned by the API`))];
  if (!all.length) {
    result.push(el('div', { class: 'empty' }, el('strong', {}, 'No public solutions.'), 'This profile has not returned any solution records.'));
    return { nodes: result, page, pages };
  }
  result.push(el('div', {},
    el('div', { class: 'solution-row head', 'aria-hidden': 'true' },
      el('span', {}, 'Solution'), el('span', {}, 'Competition'), el('span', { class: 'right' }, 'Score'), el('span', { class: 'right' }, 'Placement'), el('span', {}, 'Entered')),
    ...rows.map((solution) => {
      const competition = solution.competition && typeof solution.competition === 'object' ? solution.competition : {};
      const slug = slugOf(competition.slug);
      const placement = Number.isFinite(Number(solution.placement)) ? `#${fmtNum(solution.placement)}` : 'Unplaced';
      return el('div', { class: 'solution-row' },
        el('div', {}, el('b', { style: 'font-weight:650' }, typeof solution.title === 'string' ? solution.title : 'Untitled solution'),
          solution.prize_usd ? el('div', { class: 'meta' }, `Prize ${fmtUsd(solution.prize_usd)}`) : null),
        el('div', {}, slug ? el('a', { class: 'comp', href: `#/bounty/${encodeURIComponent(slug)}` }, typeof competition.title === 'string' ? competition.title : slug) : (competition.title || 'Unknown competition'),
          el('div', { class: 'meta' }, typeof competition.status === 'string' ? `${competition.status} · ${fmtDate(competition.deadline)}` : '')),
        el('div', { class: 'right' }, solution.score?.display ? String(solution.score.display) : solution.score?.value !== undefined ? String(solution.score.value) : '—',
          solution.score?.column?.title ? el('div', { class: 'meta' }, String(solution.score.column.title)) : null),
        el('div', { class: 'right' }, placement),
        el('div', { class: 'meta' }, fmtDate(solution.entered_at)));
    })));
  if (pages > 1) result.push(el('div', { class: 'pager' }, el('span', {}, `Page ${page} of ${pages}`),
    el('button', { class: 'btn small', type: 'button', disabled: page <= 1, onclick: () => setPage(page - 1) }, 'Previous'),
    el('button', { class: 'btn small', type: 'button', disabled: page >= pages, onclick: () => setPage(page + 1) }, 'Next')));
  return { nodes: result, page, pages };
}

function profileView(root, record, at, params) {
  const handle = handleOf(record.handle) || 'unknown';
  const rec = record.record && typeof record.record === 'object' ? record.record : {};
  const display = typeof record.display_name === 'string' && record.display_name ? record.display_name : handle;
  document.title = `${display} · FIELDNOTES / make.fun`;
  const state = { page: Math.max(1, Number(params.get('page')) || 1) };
  let renderedPage = state.page;
  const setPage = (page) => {
    state.page = page;
    const p = new URLSearchParams();
    if (page > 1) p.set('page', String(page));
    updateParams(p);
    draw();
  };
  const draw = () => {
    const solutions = solutionsNode(record, state, setPage);
    renderedPage = solutions.page;
    clear(root, pageHead(at),
      el('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, el('a', { href: '#/' }, 'Board'), el('span', {}, 'Profile'), el('span', {}, `@${handle}`)),
      el('header', { class: 'profile-head' },
        avatarNode(record, true),
        el('div', {}, el('div', { class: 'handle' }, `@${handle}`), el('h1', {}, display),
          record.bio ? el('p', {}, record.bio) : el('p', { class: 'meta' }, record.joined_at ? `Joined ${fmtDate(record.joined_at)}` : 'Public profile')),
        el('a', { class: 'btn small', href: '#/' }, '← Board')),
      el('section', { class: 'profile-stats', 'aria-label': 'Public record' },
        stat(fmtNum(rec.competitions_entered), 'Competitions entered'),
        stat(fmtNum(rec.competitions_placed), 'Placed'),
        stat(fmtNum(rec.podium_finishes), 'Podiums'),
        stat(typeof rec.prize_usd === 'string' || typeof rec.prize_usd === 'number' ? fmtUsd(rec.prize_usd) : '—', 'Prize recorded')),
      el('div', { class: 'stats', style: 'grid-template-columns:repeat(3,1fr);margin-bottom:4px' },
        stat(rec.competitions_won !== undefined ? fmtNum(rec.competitions_won) : '—', 'Wins'),
        stat(rec.best_placement !== undefined && rec.best_placement !== null ? `#${fmtNum(rec.best_placement)}` : '—', 'Best placement'),
        stat(rec.other_placements !== undefined ? fmtNum(rec.other_placements) : '—', 'Other placements')),
      solutions.nodes,
      el('p', { class: 'hash-foot' }, 'Source: make.fun public profile · placements exactly as returned'));
    setShotReady(true);
  };
  draw();
  return renderedPage;
}

export async function render({ root, parts, params, signal, isCurrent }) {
  const handle = handleOf(parts[0]);
  document.title = 'Profile · FIELDNOTES / make.fun';
  clear(root, loadingView('Loading public profile'));
  if (!handle) {
    clear(root, errorView({ status: 404, message: 'That profile handle is not valid.' }, () => { location.hash = '#/'; }));
    setShotReady(true); return;
  }
  try {
    const result = await apiGet(`profiles/${encodeURIComponent(handle)}`, { signal });
    if (!isCurrent()) return;
    if (!result.data || typeof result.data !== 'object') throw new Error('The profile record was empty.');
    const page = profileView(root, result.data, result.at, params);
    if (page !== Number(params.get('page') || 1)) {
      const p = new URLSearchParams(); if (page > 1) p.set('page', String(page)); updateParams(p);
    }
  } catch (error) {
    if (error?.name === 'AbortError' || !isCurrent()) return;
    clear(root, pageHead(null), errorView(error, () => location.reload()));
    setShotReady(true);
  }
}
