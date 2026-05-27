import './studio-reload-fab.css';

import { showStudioReloadOverlay } from '@studio/app/studio-reload-overlay.js';

export default function StudioReloadFab({ variant = 'inline', className = '' }) {
  const cls = ['studio-reload-fab', variant === 'fixed' ? 'studio-reload-fab--fixed' : '', className].filter(Boolean).join(' ');

  return (
    <button
      type='button'
      className={cls}
      aria-label='Reload page'
      onClick={() => showStudioReloadOverlay({ reloadAfter: true })}
    >
      <svg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'>
        <path
          d='M21 12a9 9 0 1 1-2.64-6.36'
          stroke='currentColor'
          strokeWidth='1.65'
          strokeLinecap='round'
        />
        <path d='M21 3v7h-7' stroke='currentColor' strokeWidth='1.65' strokeLinecap='round' strokeLinejoin='round' />
      </svg>
    </button>
  );
}
