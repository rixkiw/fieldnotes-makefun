import {
  el, clear, apiGet, errorView, loadingView, fmtNum, fmtUsd, fmtDate, phaseOf, statusLabel,
  slugOf, readParams, hashFor, updateParams, setShotReady, pageHead,
} from '../common.js';

const PAGE = 12;
const REFRESH_MS = 60_000;

function normalized(item) {
  if (!item || typeof item !== 'object') return null;
  const slug = slugOf(item.slug);
  const title = typeof item.title === 'string' ? item.title : slug;
  if (!slug || !title) return null;
  return {
    slug, title,
    reward: Number(item.potUsd ?? item.rewardAmount),
    entries: Number(item.submissionCount),
    deadline: item.deadline,
    opensAt: item.opensAt,
    status: phaseOf(item),
    statusText: statusLabel(item),
    category: typeof item.category === 'string' ? item.category : 'Uncategorized',
    sponsor: typeof item.sponsor?.name === 'string' ? item.sponsor.name : '',
    fee: Number(item.entryFeeUsd),
  };
}

function stat(value, label) {
  return el('div', { class: 'stat' }, el('b', {}, value), el('span', {}, label));
}

function row(item, index) {
  return el('article', { class: 'bounty-row', 'data-status': item.status, 'data-category': item.category },
    el('span', { class: 'no' }, String(index + 1).padStart(2, '0')),
    el('div', { class: 'bounty-title' },
      el('a', { href: `#/bounty/${encodeURIComponent(item.slug)}` }, item.title),
      el('div', { class: 'meta' }, `${item.category}${item.sponsor ? ` · ${item.sponsor}` : ''}`)),
    el('div', { class: 'num reward', title: 'Reward / live pot' }, fmtUsd(item.reward, true)),
    el('div', { class: 'deadline-col' },
      el('div', { class: 'num', style: 'font-size:11px', ...(item.deadline ? { 'data-deadline': item.deadline } : {}) }, item.status === 'upcoming' ? fmtDate(item.opensAt) : fmtDate(item.deadline)),
      el('div', { class: 'meta' }, item.status === 'upcoming' ? 'scheduled' : fmtDate(item.deadline, true))),
    el('div', { class: 'num entries-col', style: 'text-align:right' }, fmtNum(item.entries)),
    el('div', { class: 'status-col' }, el('span', { class: `status ${item.status}` }, item.statusText)));
}

function toolbar(state, onchange) {
  const search = el('input', {
    type: 'search', id: 'board-q', name: 'q', value: state.q, placeholder: 'Title, sponsor, slug…',
    autocomplete: 'off', 'aria-label': 'Search bounties',
  });
  search.addEventListener('input', () => onchange({ q: search.value, page: 1 }));
  const category = el('select', { id: 'board-cat', name: 'category', 'aria-label': 'Filter by category' },
    el('option', { value: '' }, 'All categories'),
    ...state.categories.map((c) => el('option', { value: c, ...(state.category === c ? { selected: true } : {}) }, c)));
  category.addEventListener('change', () => onchange({ category: category.value, page: 1 }));
  const status = el('select', { id: 'board-status', name: 'status', 'aria-label': 'Filter by status' },
    el('option', { value: 'all' }, 'All statuses'),
    ...[['open', 'Open'], ['upcoming', 'Opening soon'], ['closed', 'Closed']].map(([k, v]) => el('option', { value: k, ...(state.status === k ? { selected: true } : {}) }, v)));
  status.addEventListener('change', () => onchange({ status: status.value, page: 1 }));
  const sort = el('select', { id: 'board-sort', name: 'sort', 'aria-label': 'Sort bounties' },
    ...[['default', 'API order'], ['reward', 'Highest reward'], ['entries', 'Most entries'], ['deadline', 'Closing soonest']]
      .map(([k, v]) => el('option', { value: k, ...(state.sort === k ? { selected: true } : {}) }, v)));
  sort.addEventListener('change', () => onchange({ sort: sort.value, page: 1 }));
  return el('form', { class: 'toolbar', role: 'search', onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'field grow' }, el('label', { for: 'board-q' }, 'Search'), search),
    el('div', { class: 'field' }, el('label', { for: 'board-cat' }, 'Category'), category),
    el('div', { class: 'field' }, el('label', { for: 'board-status' }, 'Status'), status),
    el('div', { class: 'field' }, el('label', { for: 'board-sort' }, 'Order'), sort));
}

function filteredState(state) {
  const q = String(state.q || '').trim().toLowerCase();
  let items = state.items.filter((item) => {
    if (state.category && item.category !== state.category) return false;
    if (state.status !== 'all' && item.status !== state.status) return false;
    if (q && !`${item.title} ${item.slug} ${item.category} ${item.sponsor}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (state.sort === 'reward') items.sort((a, b) => (b.reward || 0) - (a.reward || 0));
  if (state.sort === 'entries') items.sort((a, b) => (b.entries || 0) - (a.entries || 0));
  if (state.sort === 'deadline') items.sort((a, b) => {
    const rank = { open: 0, upcoming: 1, closed: 2 };
    return (rank[a.status] - rank[b.status]) || (new Date(a.deadline || a.opensAt) - new Date(b.deadline || b.opensAt));
  });
  if (state.sort === 'default') items.sort((a, b) => ({ open: 0, upcoming: 1, closed: 2 }[a.status] - { open: 0, upcoming: 1, closed: 2 }[b.status]));
  return items;
}

function boardItems(items) {
  return el('div', { class: 'ledger' },
    el('div', { class: 'ledger-head', 'aria-hidden': 'true' },
      el('span', {}, 'No.'), el('span', {}, 'Bounty'), el('span', { class: 'num' }, 'Pot'),
      el('span', {}, 'Timing'), el('span', { class: 'num' }, 'Entries'), el('span', { class: 'status-col' }, 'Status')),
    ...items.map((item, index) => row(item, index)));
}

function boardView(root, state, error = null) {
  const visible = error ? [] : filteredState(state);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE));
  const page = Math.min(Math.max(1, state.page), pageCount);
  state.page = page;
  const paged = visible.slice((page - 1) * PAGE, page * PAGE);
  const open = state.items.filter((i) => i.status === 'open').length;
  const upcoming = state.items.filter((i) => i.status === 'upcoming').length;
  const pot = state.items.reduce((sum, i) => sum + (Number.isFinite(i.reward) ? i.reward : 0), 0);
  const entries = state.items.reduce((sum, i) => sum + (Number.isFinite(i.entries) ? i.entries : 0), 0);
  const categories = [...new Set(state.items.map((i) => i.category))].sort();
  const record = (next) => {
    Object.assign(state, next);
    const params = new URLSearchParams();
    for (const key of ['q', 'category', 'status', 'sort', 'page']) {
      if (key === 'page' ? state.page > 1 : state[key] && state[key] !== 'all' && state[key] !== 'default') params.set(key, state[key]);
    }
    updateParams(params);
    boardView(root, state);
  };
  const retry = async () => {
    clear(root, pageHead(null), loadingView('Retrying board'));
    setShotReady(false);
    try {
      const result = await apiGet('competitions?limit=50', { refresh: true });
      Object.assign(state, { at: result.at, error: null });
      state.items = (Array.isArray(result.data?.items) ? result.data.items : []).map(normalized).filter(Boolean);
      root.replaceChildren(...boardLayout(state, record));
      setShotReady(true);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      clear(root, pageHead(null), errorView(err, retry));
      setShotReady(true);
    }
  };
  const nodes = boardLayout({ ...state, open, upcoming, pot, entries, categories, visible, paged, page, pageCount, error, record });
  clear(root, ...nodes);
  if (paged.length) setShotReady(true);
}

function boardLayout(s) {
  const frag = [
    pageHead(s.at),
    el('header', { class: 'hero' },
      el('div', {}, el('div', { class: 'kicker' }, 'Independent bounty desk · vol. 01'),
        el('h1', {}, 'Good work deserves a ', el('em', {}, 'bounty.')),
        el('p', {}, 'A calm, read-only view of make.fun’s public competitions. Find the work, read the terms, then follow the entrants and the live ledger.')),
      el('aside', { class: 'hero-note' }, el('strong', {}, 'Desk note'),
        'Every figure below comes from the public API. Pot and reward are distinct; closing dates are the source of truth.')),
    el('section', { class: 'stats', 'aria-label': 'Loaded board summary' },
      stat(fmtNum(s.items.length), 'Bounties loaded'),
      stat(fmtUsd(s.pot, true), 'Total pot'),
      stat(fmtNum(s.open + s.upcoming), 'Open or upcoming'),
      stat(fmtNum(s.entries), 'Submissions')),
    el('div', { class: 'section-head' }, el('h2', {}, 'Bounty ledger'),
      el('p', {}, s.items.length ? `${fmtNum(s.visible.length)} of ${fmtNum(s.items.length)} loaded` : 'Live public index')),
    toolbar(s, s.record),
  ];
  if (s.error) frag.push(errorView(s.error, s.retry));
  else if (!s.items.length) frag.push(el('div', { class: 'empty' }, el('strong', {}, 'No bounties returned'), 'The public API responded, but its list is empty.'));
  else if (!s.visible.length) frag.push(el('div', { class: 'empty' },
    el('strong', {}, 'No ledger lines match.'),
    'Try a broader search or clear the filters.',
    el('div', { style: 'margin-top:14px' }, el('button', { class: 'btn small', type: 'button', onclick: () => s.record({ q: '', category: '', status: 'all', sort: 'default', page: 1 }) }, 'Clear filters'))));
  else frag.push(boardItems(s.paged));
  if (s.visible.length > PAGE) {
    frag.push(el('div', { class: 'pager' },
      el('span', {}, `Page ${s.page} of ${s.pageCount}`),
      el('button', { class: 'btn small', type: 'button', disabled: s.page <= 1, onclick: () => s.record({ page: s.page - 1 }) }, 'Previous'),
      el('button', { class: 'btn small', type: 'button', disabled: s.page >= s.pageCount, onclick: () => s.record({ page: s.page + 1 }) }, 'Next')));
  }
  return frag;
}

export async function render({ root, params, signal, isCurrent }) {
  const state = {
    items: [], q: params.get('q') || '', category: params.get('category') || '',
    status: params.get('status') || 'all', sort: params.get('sort') || 'default',
    page: Math.max(1, Number(params.get('page')) || 1), at: null, error: null,
  };
  document.title = 'Bounty board · FIELDNOTES / make.fun';
  clear(root, pageHead(null), loadingView());
  const results = new Map(state.items.map((i) => [i.slug, i]));
  const cursors = [];
  let next = '', pages = 0;
  try {
    do {
      const query = `competitions?limit=50${next ? `&cursor=${encodeURIComponent(next)}` : ''}`;
      const result = await apiGet(query, { signal });
      if (!isCurrent()) return;
      state.at = Math.max(state.at || 0, result.at);
      for (const item of Array.isArray(result.data?.items) ? result.data.items : []) {
        const value = normalized(item);
        if (value) results.set(value.slug, value);
      }
      next = typeof result.data?.next_cursor === 'string' && result.data.next_cursor && !cursors.includes(result.data.next_cursor) ? result.data.next_cursor : '';
      if (next) cursors.push(next);
      state.items = [...results.values()];
      if (++pages >= 12) break;
    } while (next && isCurrent());
    state.items = [...results.values()];
    boardView(root, state);
  } catch (error) {
    if (error?.name === 'AbortError' || !isCurrent()) return;
    if (state.items.length) { state.at ||= Date.now(); boardView(root, state); return; }
    state.error = error;
    clear(root, pageHead(state.at), errorView(error, () => location.reload()));
    setShotReady(true);
  }
  document.querySelectorAll('[data-refreshed]').forEach((n) => { n.dataset.refreshed = String(state.at || ''); });
}
