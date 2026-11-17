const API_ROOT = 'https://make.fun/api/';
const TTL_MS = 60_000;
const CACHE_PREFIX = 'fieldnotes:api:';
const memory = new Map();
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function cacheKey(path) { return CACHE_PREFIX + path; }

function readStored(path) {
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(path)) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

function writeStored(path, value) {
  try { localStorage.setItem(cacheKey(path), JSON.stringify(value)); } catch { /* storage may be unavailable */ }
}

function retryAfterMs(response) {
  const value = response.headers.get('Retry-After');
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(value) - Date.now());
}

async function parseError(response) {
  let message = `API returned ${response.status}`;
  try {
    const body = await response.json();
    const first = body?.error?.[0]?.message;
    if (typeof first === 'string') message = first;
  } catch { /* non-JSON error */ }
  return new ApiError(message, response.status, retryAfterMs(response));
}

export async function apiGet(path, { refresh = false, signal } = {}) {
  const key = path;
  const now = Date.now();
  const local = memory.get(key) || readStored(path);
  if (!refresh && local && now >= local.at && now - local.at < TTL_MS) {
    return { data: local.data, at: local.at, source: 'cache' };
  }
  if (!refresh && inflight.has(key)) {
    const hit = await inflight.get(key);
    return { data: hit.data, at: hit.at, source: 'shared' };
  }
  const request = (async () => {
    const headers = {};
    if (local?.etag) headers['If-None-Match'] = local.etag;
    const response = await fetch(API_ROOT + path, {
      method: 'GET', headers, signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (response.status === 304 && local) {
      const hit = { data: local.data, at: Date.now(), etag: local.etag, source: 'revalidated' };
      memory.set(key, hit); writeStored(path, hit);
      return hit;
    }
    if (response.status === 429) throw await parseError(response);
    if (!response.ok) throw await parseError(response);
    const data = await response.json();
    const hit = { data, at: Date.now(), etag: response.headers.get('ETag') || local?.etag || null };
    memory.set(key, hit); writeStored(path, hit);
    return hit;
  })();
  inflight.set(key, request);
  try { return await request; }
  finally { if (inflight.get(key) === request) inflight.delete(key); }
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = String(value);
    else if (name.startsWith('on') && typeof value === 'function') node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node, ...children) {
  node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
}

export function safeUrl(value, image = false) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, 'https://make.fun');
    if (url.protocol !== 'https:' || url.hostname !== 'make.fun') return null;
    if (image && !url.pathname.startsWith('/api/')) return null;
    return url.href;
  } catch { return null; }
}

export function fmtUsd(value, whole = false) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: whole || Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: whole || Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

export function fmtNum(value, digits = 0) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n);
}

export function fmtDate(value, withTime = false) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}),
  }).format(d);
}

export function timeLeft(value, now = Date.now()) {
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return 'unknown';
  const ms = end - now;
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes % 60}m left`;
  return `${Math.max(1, minutes)}m left`;
}

export function elapsedLabel(at) {
  if (!at) return 'not refreshed yet';
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 5) return 'refreshed just now';
  if (s < 60) return `refreshed ${s}s ago`;
  return `refreshed ${Math.floor(s / 60)}m ago`;
}

export function phaseOf(item, now = Date.now()) {
  const opens = item?.opensAt ? new Date(item.opensAt).getTime() : null;
  const closes = item?.deadline ? new Date(item.deadline).getTime() : null;
  if (Number.isFinite(opens) && now < opens) return 'upcoming';
  if (item?.status === 'resolved' || (Number.isFinite(closes) && now >= closes) || item?.acceptingSubmissions === false) return 'closed';
  if (item?.acceptingSubmissions === true) return 'open';
  if (item?.status === 'open') return 'open';
  return 'closed';
}

export function statusLabel(item, now = Date.now()) {
  const phase = phaseOf(item, now);
  return phase === 'upcoming' ? 'Opens soon' : phase === 'open' ? 'Open' : 'Closed';
}

export function slugOf(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) ? value : null;
}

export function handleOf(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value) ? value : null;
}

export function editDistance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old;
    }
  }
  return row[b.length];
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/[\s_-]+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();
}

export function avatarNode(record, large = false) {
  const node = el('span', { class: large ? 'avatar large' : 'avatar', 'aria-hidden': 'true' });
  const src = safeUrl(record?.avatar || record?.image, true);
  if (src) node.append(el('img', { src, alt: '', width: large ? 74 : 32, height: large ? 74 : 32, referrerpolicy: 'no-referrer' }));
  else node.textContent = initials(record?.display_name || record?.handle || record?.handle || '');
  return node;
}

function inlineMarkdown(text) {
  const frag = document.createDocumentFragment();
  const pattern = /(`[^`\n]+`)|(\[([^\]]+)\]\((https:\/\/[^\s)]+)\))|(\*\*([^*\n]+)\*\*)|(__([^_\n]+)__)|(\*([^*\n]+)\*)|(\bhttps:\/\/[^\s<]+)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) frag.append(text.slice(last, match.index));
    if (match[1]) frag.append(el('code', {}, match[1].slice(1, -1)));
    else if (match[2]) {
      const href = safeUrl(match[4]);
      if (href) frag.append(el('a', { href, rel: 'noopener noreferrer', target: '_blank' }, match[3]));
      else frag.append(match[3]);
    } else if (match[5]) frag.append(el('strong', {}, match[6]));
    else if (match[7]) frag.append(el('strong', {}, match[8]));
    else if (match[9]) frag.append(el('em', {}, match[10]));
    else if (match[11]) {
      const href = safeUrl(match[11]);
      if (href) frag.append(el('a', { href, rel: 'noopener noreferrer', target: '_blank' }, match[11]));
      else frag.append(match[11]);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

export function renderMarkdown(source) {
  const root = el('div', { class: 'prose' });
  if (typeof source !== 'string' || !source.trim()) {
    root.append(el('p', { class: 'meta' }, 'No description supplied.'));
    return root;
  }
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let list = null;
  const closeList = () => { list = null; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      closeList();
      root.append(el(`h${heading[1].length}`, {}, inlineMarkdown(heading[2])));
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || ordered) {
      const tag = bullet ? 'ul' : 'ol';
      if (!list || list.tagName.toLowerCase() !== tag) {
        list = el(tag); root.append(list);
      }
      list.append(el('li', {}, inlineMarkdown((bullet || ordered)[1])));
      continue;
    }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
      para.push(lines[i].trim()); i++;
    }
    i--;
    root.append(el('p', {}, inlineMarkdown(para.join(' '))));
  }
  return root;
}

export function readParams() {
  return new URLSearchParams(location.hash.split('?')[1] || '');
}

export function hashFor(path, params = null) {
  const q = params ? params.toString() : '';
  return `#${path}${q ? `?${q}` : ''}`;
}

export function updateParams(params) {
  const path = location.hash.slice(1).split('?')[0];
  const query = params.toString();
  history.replaceState(null, '', `#${path}${query ? `?${query}` : ''}`);
}

export function navItems(active) {
  return [
    ['#/', 'Board', '01', 'board'],
    ['#/leaderboard/makefun-frontend-01', 'Live index', '02', 'live'],
    ['#/leaderboard/tiny-chess-01', 'Games', '03', 'games'],
    ['#/leaderboard/best-game-01', 'Code', '04', 'code'],
  ].map(([href, label, index, key]) => el('a', {
    class: 'nav-item', href, ...(active === key ? { 'aria-current': 'page' } : {}),
  }, el('span', {}, label), el('span', {}, index)));
}

export function setShotReady(value) { window.__shotReady = value; }

export function errorView(error, retry) {
  return el('div', { class: 'notice error', role: 'alert' },
    el('strong', {}, error?.status === 404 ? 'Not found' : 'The public API is out of reach'),
    el('p', {}, error?.message || 'An unexpected error interrupted this view.'),
    el('button', { class: 'btn', type: 'button', onclick: retry }, 'Try again'));
}

export function pageHead(refreshedAt, label = 'LIVE PUBLIC API') {
  return el('div', { class: 'page-head' },
    el('span', { class: 'live' }, label),
    el('span', { class: 'refreshed', 'data-refreshed': refreshedAt || '' }, elapsedLabel(refreshedAt)));
}

export function loadingView(label = 'Reading public API') {
  return el('div', { class: 'loading', role: 'status' }, label);
}

export function setBusy(busy) {
  const main = document.getElementById('route');
  if (main) main.setAttribute('aria-busy', busy ? 'true' : 'false');
}
