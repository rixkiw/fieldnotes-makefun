import { el, clear, apiGet, errorView, loadingView, navItems, setBusy, setShotReady, pageHead } from './common.js';

const routeRoot = document.getElementById('route');
const sideNav = document.getElementById('side-nav');
const mobileNav = document.getElementById('mobile-nav');
const navToggle = document.querySelector('.nav-toggle');
let navigation = 0;
let controller = null;
let refreshTimer = 0;

const routes = {
  board: () => import('./routes/board.js'),
  bounty: () => import('./routes/bounty.js'),
  leaderboard: () => import('./routes/leaderboard.js'),
  profile: () => import('./routes/profile.js'),
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return { name: 'board', parts: [], params: new URLSearchParams() };
  const [pathPart, query = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  return { name: parts[0] || 'board', parts: parts.slice(1), params: new URLSearchParams(query) };
}

function activeNav(name) {
  if (name === 'board') return 'board';
  if (name === 'leaderboard') return location.hash.includes('makefun-frontend-01') ? 'live' : 'code';
  return '';
}

function syncNav(name) {
  const active = activeNav(name);
  clear(sideNav, el('div', { class: 'eyebrow' }, 'INDEX'), navItems(active));
  clear(mobileNav, navItems(active));
}

function closeMobileNav({ restoreFocus = false } = {}) {
  mobileNav.classList.remove('open');
  mobileNav.hidden = true;
  navToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) navToggle.focus();
}

navToggle.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(open));
  mobileNav.hidden = !open;
  mobileNav.classList.toggle('open', open);
  if (open) requestAnimationFrame(() => { if (!mobileNav.hidden) mobileNav.querySelector('a')?.focus(); });
});
mobileNav.addEventListener('click', (event) => { if (event.target.closest('a')) closeMobileNav(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobileNav.hidden) closeMobileNav({ restoreFocus: true });
});

async function render() {
  const ticket = ++navigation;
  if (controller) controller.abort();
  controller = new AbortController();
  clearTimeout(refreshTimer);
  const { name, parts, params } = parseHash();
  syncNav(name);
  setBusy(true);
  setShotReady(false);
  closeMobileNav();
  window.scrollTo(0, 0);
  document.getElementById('main').focus({ preventScroll: true });
  let module;
  try {
    if (name === 'board' || name === '') module = await routes.board();
    else if (name === 'bounty' && parts[0]) module = await routes.bounty();
    else if (name === 'leaderboard' && parts[0]) module = await routes.leaderboard();
    else if (name === 'profile' && parts[0]) module = await routes.profile();
    else {
      clear(routeRoot, pageHead(null, '404 / FIELDNOTES'), el('div', { class: 'notice' },
        el('h2', {}, 'That page is not in this index.'),
        el('p', {}, 'The available routes are board, bounty, leaderboard and profile.'),
        el('a', { class: 'btn', href: '#/' }, 'Return to the board')));
      document.title = 'Not found · FIELDNOTES';
      setBusy(false); setShotReady(true); return;
    }
  } catch (error) {
    if (ticket !== navigation) return;
    clear(routeRoot, errorView(error, render));
    setBusy(false); setShotReady(true); return;
  }
  if (ticket !== navigation) return;
  try {
    await module.render({ root: routeRoot, parts, params, signal: controller.signal, navigate: render, isCurrent: () => ticket === navigation, pageHead });
  } catch (error) {
    if (error?.name === 'AbortError' || ticket !== navigation) return;
    clear(routeRoot, errorView(error, render));
  } finally {
    if (ticket === navigation) {
      setBusy(false);
      if (!routeRoot.querySelector('.loading')) setShotReady(true);
      refreshTimer = setInterval(() => {
        document.querySelectorAll('[data-refreshed]').forEach((node) => {
          const stamp = Number(node.dataset.refreshed);
          const seconds = stamp ? Math.max(0, Math.floor((Date.now() - stamp) / 1000)) : null;
          node.textContent = seconds === null ? 'not refreshed yet' : seconds < 5 ? 'refreshed just now' : seconds < 60 ? `refreshed ${seconds}s ago` : `refreshed ${Math.floor(seconds / 60)}m ago`;
        });
        const countdowns = document.querySelectorAll('[data-deadline]');
        for (const node of countdowns) {
          const deadline = new Date(node.dataset.deadline).getTime();
          if (!Number.isFinite(deadline)) continue;
          const ms = deadline - Date.now();
          if (ms <= 0) { node.textContent = 'ended'; continue; }
          const minutes = Math.floor(ms / 60000), days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60);
          node.textContent = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${minutes % 60}m left` : `${Math.max(1, minutes)}m left`;
        }
      }, 30_000);
    }
  }
}

window.addEventListener('hashchange', render);
render();
