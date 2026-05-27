import { useCallback } from 'react';

import StudioReloadFab from '@studio/components/StudioReloadFab.jsx';

export default function ProductStudioChrome({ workspace }) {
  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  }, []);

  return (
    <>
      <div className="bottle-brandbar">
        <div className="bottle-brandbar-left">
          <a href="/" className="bottle-brand-logo" aria-label="Studio home">
            <img src="/assets/2d/aio.png" alt="" />
          </a>
          <button type="button" className="bottle-back-btn" onClick={goBack} aria-label="Go back">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M14.8 5.6L8.4 12L14.8 18.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M9 12H20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="bottle-brandbar-right">
          <StudioReloadFab className="bottle-reload-fab" />
        </div>
      </div>

      <nav className="product-studio-workspace-tabs" aria-label="Studio workspaces">
        <a href="/configurator/" className={workspace === 'colors' ? 'active' : ''}>
          Colors
        </a>
        <a href="/bottle" className={workspace === 'logo' ? 'active' : ''}>
          Logo mockup
        </a>
        <a href="/configurebottle">All in one</a>
      </nav>
    </>
  );
}
