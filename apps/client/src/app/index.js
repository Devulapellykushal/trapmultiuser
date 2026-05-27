import '../styles/globals.css';
import '../styles/globals.scss';
/* reload-loader.css is linked from index.html <head> so it applies before first paint (no FOUC). */

import { mountLandingClassicChrome } from './mount-landing-classic-chrome.jsx';
import { mountLandingEffects } from './mount-landing-effects.jsx';

const MIN_RELOAD_MS = 3000;
const HOME_PATH = '/';

function notifyLandingPath() {
  window.dispatchEvent(new CustomEvent('studio:landing-path'));
}

function hideReloadLoader() {
  const el = document.querySelector('#reload-loader');
  const main = document.querySelector('main.landing-root');
  main?.classList.remove('landing-root--boot-hidden');

  if (!el) {
    return;
  }
  el.setAttribute('aria-busy', 'false');
  el.classList.add('reload-loader--exiting');
  const done = () => {
    el.remove();
  };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 650);
}

function applyLandingHome(updateHistory = true) {
  const main = document.querySelector('main.landing-root');
  const visuals = document.querySelector('#landing-visuals-root');
  const heroShell = document.querySelector('#landing-hero-shell');
  if (!main || !visuals) return;

  main.classList.remove('landing-root--next-mode');
  main.classList.remove('landing-root--cinematic-transition');
  main.setAttribute('data-landing-mode', 'home');
  heroShell?.classList.remove('landing-hero--transitioning');
  visuals.classList.remove('landing-visuals--transitioning');
  visuals.classList.add('hidden');
  visuals.classList.remove('flex');
  if (updateHistory && window.location.pathname !== HOME_PATH) {
    window.history.pushState({}, '', HOME_PATH);
  }
  notifyLandingPath();
}

document.addEventListener('DOMContentLoaded', () => {});

window.addEventListener('load', () => {
  const bootStartedAt = performance.now();

  if (window.location.pathname === '/next' || window.location.pathname === '/next/') {
    window.history.replaceState({}, '', HOME_PATH);
  }

  mountLandingClassicChrome();
  mountLandingEffects();
  applyLandingHome(false);

  window.__enterNextExperience = () => {
    window.location.assign('/login?next=%2Fadmin');
  };
  window.__navigateLandingPath = (path) => {
    const p = path || '/';
    if (p === '/next' || p.startsWith('/next/')) {
      window.history.pushState({}, '', HOME_PATH);
      applyLandingHome(false);
      return;
    }
    if (p.startsWith('/login')) {
      window.location.assign(p);
      return;
    }
    if (p !== window.location.pathname) {
      window.history.pushState({}, '', p);
    }
    applyLandingHome(false);
  };

  window.addEventListener('popstate', () => {
    if (window.location.pathname === '/next' || window.location.pathname === '/next/') {
      window.history.replaceState({}, '', HOME_PATH);
    }
    applyLandingHome(false);
  });

  const elapsed = performance.now() - bootStartedAt;
  const remaining = Math.max(0, MIN_RELOAD_MS - elapsed);
  setTimeout(hideReloadLoader, remaining);
});
