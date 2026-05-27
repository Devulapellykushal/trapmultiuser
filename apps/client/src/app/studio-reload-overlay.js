import '../styles/reload-loader.css';

/** Matches boot flow in `src/app/index.js` */
export const STUDIO_RELOAD_MIN_MS = 3000;

const LOADER_INNER_HTML = `
      <div class="main">
        <div class="up">
          <div class="loaders">
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
            <div class="loader"></div>
          </div>
          <div class="loadersB">
            <div class="loaderA"><div class="ball0"></div></div>
            <div class="loaderA"><div class="ball1"></div></div>
            <div class="loaderA"><div class="ball2"></div></div>
            <div class="loaderA"><div class="ball3"></div></div>
            <div class="loaderA"><div class="ball4"></div></div>
            <div class="loaderA"><div class="ball5"></div></div>
            <div class="loaderA"><div class="ball6"></div></div>
            <div class="loaderA"><div class="ball7"></div></div>
            <div class="loaderA"><div class="ball8"></div></div>
          </div>
        </div>
      </div>
`;

function hideOverlay(el) {
  if (!el?.isConnected) return;
  el.setAttribute('aria-busy', 'false');
  el.classList.add('reload-loader--exiting');
  const done = () => {
    el.remove();
  };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 650);
}

/**
 * Full-screen studio radial loader (same markup/CSS as initial boot).
 * @param {{ minMs?: number; reloadAfter?: boolean }} [options]
 */
export function showStudioReloadOverlay(options = {}) {
  const minMs = options.minMs ?? STUDIO_RELOAD_MIN_MS;
  const reloadAfter = options.reloadAfter ?? true;

  if (document.getElementById('reload-loader')) {
    return;
  }

  const el = document.createElement('div');
  el.id = 'reload-loader';
  el.className = 'reload-loader';
  el.setAttribute('aria-busy', 'true');
  el.setAttribute('aria-label', 'Loading');
  el.innerHTML = LOADER_INNER_HTML.trim();
  document.body.appendChild(el);

  const startedAt = performance.now();
  const finish = () => {
    hideOverlay(el);
    if (reloadAfter) {
      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    }
  };

  const elapsed = performance.now() - startedAt;
  const remaining = Math.max(0, minMs - elapsed);
  window.setTimeout(finish, remaining);
}
