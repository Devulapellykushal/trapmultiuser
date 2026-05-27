import { createRoot } from 'react-dom/client';

import LandingVisualSections from '@studio/features/landing/LandingVisualSections.jsx';

let galleryRoot = null;

export function mountLandingGallery() {
  const el = document.querySelector('#landing-visuals-root');
  if (!el) return;
  if (!galleryRoot) {
    galleryRoot = createRoot(el);
  }
  // Avoid StrictMode here: it double-mounts effects, which breaks WebGL on the same
  // <canvas> (InfiniteMenu) when cleanup calls WEBGL_lose_context.
  galleryRoot.render(<LandingVisualSections />);
}
