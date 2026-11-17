import {
  el, clear, apiGet, errorView, loadingView, fmtNum, fmtDate, slugOf, handleOf,
  updateParams, setShotReady, pageHead,
} from '../common.js';

const PAGE_SIZE = 25;

function displayValue(entry, column) {
  const shown = entry?.display?.[column.key];
  if (typeof shown === 'string' || typeof shown === 'number') return String(shown);
  const value = entry?.values?.[column.key];
  return value === null || value === undefined ? '—' : String(value);
}

function titleRecord(entry) {
  return typeof entry?.title === 'string' && entry.title.trim() ? entry.title : 'Untitled entry';
}

function entrantNode(entry) {
  const handle = handleOf(entry?.handle);
  return el('div', { style: 'min-width:0' },
    el('div', { class: 'lb-entry-title' }, titleRecord(entry)),
    el('div', { class: 'lb-handle' },
      handle ? el('a', { href: `#/profile/${encodeURIComponent(handle)}` }, `@${handle}`) : '@hidden',
      entry?.house ? el('span', { class: 'badge' }, 'house') : null,
      entry?.baseline ? el('span', { class: 'badge' }, 'baseline') : null,
      entry?.internal ? el('span', { class: 'badge' }, 'internal') : null));
}

function podium(entries, primary) {
  const top = entries.slice(0, 3);
  if (!top.length || !primary) return null;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return el('section', { class: 'podium', 'aria-label': 'Top three entries' },
    ...order.map((entry) => el('article', { class: `podium-card ${entry.rank === 1 ? 'first' : ''}` },
      el('div', { class: 'podium-rank' }, `#${fmtNum(entry.rank)}`),
      el('a', { ...(handleOf(entry.handle) ? { href: `#/profile/${encodeURIComponent(entry.handle)}` } : {}) },
        el('h3', {}, titleRecord(entry)),
        el('p', {}, handleOf(entry.handle) ? `@${entry.handle}` : 'handle hidden')),
      el('span', { class: 'podium-score' }, displayValue(entry, primary)))));
}

function pageRange(total, page) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safe = Math.min(pages, Math.max(1, page));
  return { pages, safe, start: (safe - 1) * PAGE_SIZE, end: safe * PAGE_SIZE };
}

function leaderboardLayout(state) {
  const { data, query, sort, page, at } = state;
  const columns = (Array.isArray(data?.columns) ? data.columns : [])
    .filter((c) => c && typeof c.key === 'string' && c.hidden !== true).slice(0, 3);
  const allEntries = Array.isArray(data?.entries) ? data.entries : [];
  const placeHidden = ['final', 'after_finalize'].includes(data?.phase?.scores) && !data?.phase?.finalized_at;
  const scoresVisible = data?.phase?.scores_visible !== false;
  const hasFreshLiveRanks = allEntries.some((entry) => typeof entry?.rank === 'number' && entry?.judge?.provisional === true);
  const now = Date.now();
  const comp = data?.competition || {};
  const provisional = !placeHidden && (data?.phase?.finalized_at == null || allEntries.some((e) => e?.judge?.provisional === true));
  const primary = columns[0];
  let entries = scoresVisible ? allEntries.filter((e) => e && typeof e === 'object') : [];
  const q = String(query.q || '').trim().toLowerCase();
  if (q) entries = entries.filter((e) => `${e.handle || ''} ${e.title || ''}`.toLowerCase().includes(q));
  const sortKey = columns.some((c) => c.key === sort) ? sort : null;
  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey);
    const asc = col.sorting === 'asc';
    entries = [...entries].sort((a, b) => {
      const av = Number(a?.values?.[sortKey]), bv = Number(b?.values?.[sortKey]);
      if (!Number.isFinite(av) && !Number.isFinite(bv)) return (a.rank || 0) - (b.rank || 0);
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return asc ? av - bv : bv - av;
    });
  }
  const range = pageRange(entries.length, page);
  const pageEntries = entries.slice(range.start, range.end);
  const visibleEntries = scoresVisible ? entries : allEntries;
  const subtitle = q || sortKey ? `${fmtNum(visibleEntries.length)} matching of ${fmtNum(allEntries.length)} loaded` : `${fmtNum(allEntries.length)} entries loaded`;
  const title = comp.title || slugOf(data?.competition?.slug) || 'Leaderboard';
  document.title = `${title} leaderboard · FIELDNOTES / make.fun`;
  const setView = (next) => {
    const p = new URLSearchParams();
    if (next.sort && next.sort !== 'rank') p.set('sort', next.sort);
    if (next.q) p.set('q', next.q);
    if (next.page > 1) p.set('page', String(next.page));
    updateParams(p); state.page = next.page; state.sort = next.sort || 'rank'; state.query.q = next.q || '';
    leaderboardSurface(state);
  };
  const stepPage = (delta) => setView({ sort: state.sort, q: state.query.q, page: page + delta });
  const search = el('input', { type: 'search', placeholder: 'Handle or entry title', value: query.q || '', 'aria-label': 'Search leaderboard', autocomplete: 'off', id: 'lb-search' });
  search.addEventListener('input', () => setView({ sort: state.sort, q: search.value, page: 1 }));
  const sortSelect = el('select', { id: 'lb-sort', 'aria-label': 'Sort leaderboard' },
    el('option', { value: 'rank' }, 'API rank'),
    ...columns.slice(1).map((c) => el('option', { value: c.key, ...(sort === c.key ? { selected: true } : {}) }, String(c.title || c.key))));
  sortSelect.addEventListener('change', () => setView({ sort: sortSelect.value, q: state.query.q, page: 1 }));
  const phaseLine = data?.phase ? `${data.phase.title || data.phase.key} · ${data.phase.starts_at ? fmtDate(data.phase.starts_at) : ''}${data.phase.ends_at ? ` – ${fmtDate(data.phase.ends_at)}` : ''}` : 'Phase not supplied';
  const nodes = [
    pageHead(at),
    el('nav', { class: 'crumb', 'aria-label': 'Breadcrumb' }, el('a', { href: '#/' }, 'Board'), el('span', {}, 'Leaderboard'), el('span', {}, title)),
    el('header', { class: 'bounty-hero' },
      el('div', { class: 'kicker' }, `${comp.category || data?.view || 'Performance'} · ${comp.status || 'live'}`),
      el('h1', {}, title),
      el('div', { class: 'hero-meta' },
        el('a', { class: 'btn small', href: `#/bounty/${encodeURIComponent(comp.slug || state.slug)}` }, '← Bounty brief'),
        el('span', {}, phaseLine),
        provisional ? el('span', { class: 'status upcoming' }, 'Provisional ranking') : el('span', { class: 'status' }, 'Finalized ranking'))),
  ];
  if (!scoresVisible || (placeHidden && !hasFreshLiveRanks)) {
    nodes.push(el('div', { class: 'notice' },
      el('h2', {}, 'The scores are withheld in this phase.'),
      el('p', {}, 'The public API is not sharing this phase’s metrics yet. Entrant identities remain listed where the API supplies them.'),
      el('div', { class: 'ledger' }, ...visibleEntries.slice(0, PAGE_SIZE).map((e) => el('div', { class: 'lb-row' },
        el('span', { class: 'rank' }, e.rank ? `#${e.rank}` : '—'), entrantNode(e), el('span', { class: 'right' }, 'hidden'))))));
  } else {
    nodes.push(el('div', { class: 'toolbar', role: 'search' },
      el('div', { class: 'field grow' }, el('label', { for: 'lb-search' }, 'Filter entries'), search),
      el('div', { class: 'field' }, el('label', { for: 'lb-sort' }, 'Sort loaded rows'), sortSelect),
      el('span', { class: 'refreshed' }, subtitle)));
    if (provisional) nodes.push(el('div', { class: 'notice', style: 'border-left-color:#9a7c25;background:#f7f1df;margin-top:0;padding:14px 18px' },
      el('strong', { style: 'font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase' }, 'Provisional until finalized'),
      el('span', { style: 'display:block;margin-top:3px;color:var(--ink-soft);font-size:12px' }, 'These positions can change. Only a finalized phase should be read as a result.')));
    if (primary) nodes.push(podium(allEntries, primary));
    nodes.push(el('div', { class: 'ledger' },
      el('div', { class: 'lb-row head', style: `--cols:${columns.length}` },
        el('span', {}, 'Rank'), el('span', {}, 'Entry / handle'),
        ...columns.map((c, i) => el('span', { class: `right ${i > 0 ? 'hide-mobile' : ''}` }, String(c.title || c.key)))),
      ...pageEntries.map((entry) => el('div', { class: 'lb-row', style: `--cols:${columns.length}` },
        el('span', { class: `rank ${entry.rank <= 3 ? 'top' : ''}` }, entry.rank ? `#${fmtNum(entry.rank)}` : '—'),
        entrantNode(entry),
        ...columns.map((c, i) => el('span', { class: `right ${i > 0 ? 'hide-mobile' : ''}` }, displayValue(entry, c)))))));
    if (!entries.length) nodes.push(el('div', { class: 'empty' }, el('strong', {}, q ? 'No entrants match.' : 'No entries are published.'), q ? 'Change the filter to see more.' : 'The API returned an empty list.'));
    if (range.pages > 1) nodes.push(el('div', { class: 'pager' }, el('span', {}, `Page ${range.safe} of ${range.pages}`),
      el('button', { class: 'btn small', type: 'button', disabled: range.safe <= 1, onclick: () => stepPage(-1) }, 'Previous'),
      el('button', { class: 'btn small', type: 'button', disabled: range.safe >= range.pages, onclick: () => stepPage(1) }, 'Next')));
    if (data?.metrics_withheld) nodes.push(el('p', { class: 'hash-foot' }, 'Some metrics are withheld by the API for this phase. No scores have been inferred.'));
  }
  nodes.push(el('p', { class: 'hash-foot' }, 'Source: make.fun public leaderboard · rank order from the API'));
  return nodes;
}

function leaderboardSurface(state) {
  clear(state.root, ...leaderboardLayout(state));
  setShotReady(true);
}

export async function render({ root, parts, params, signal, isCurrent }) {
  const slug = slugOf(parts[0]);
  document.title = 'Leaderboard · FIELDNOTES / make.fun';
  clear(root, loadingView('Loading public leaderboard'));
  if (!slug) {
    clear(root, errorView({ status: 404, message: 'That competition slug is not valid.' }, () => { location.hash = '#/'; }));
    setShotReady(true); return;
  }
  const state = { root, slug, query: { q: params.get('q') || '' }, sort: params.get('sort') || 'rank', page: Math.max(1, Number(params.get('page')) || 1), data: null, at: null };
  try {
    const result = await apiGet(`competitions/${encodeURIComponent(slug)}/leaderboard?view=performance`, { signal });
    if (!isCurrent()) return;
    Object.assign(state, { data: result.data, at: result.at });
    leaderboardSurface(state);
  } catch (error) {
    if (error?.name === 'AbortError' || !isCurrent()) return;
    clear(root, pageHead(null), errorView(error, () => location.reload()));
    setShotReady(true);
  }
}
