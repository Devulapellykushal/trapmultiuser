import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import LandingClassicChrome from '@studio/features/landing/LandingClassicChrome.jsx';

let chromeRoot;

export function mountLandingClassicChrome() {
  const el = document.querySelector('#landing-chrome-root');
  if (!el) {
    return;
  }
  if (!chromeRoot) {
    chromeRoot = createRoot(el);
  }
  chromeRoot.render(
    <StrictMode>
      <LandingClassicChrome />
    </StrictMode>
  );
}
