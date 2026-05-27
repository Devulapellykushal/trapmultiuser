import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { proxy } from 'valtio';

import BottleCanvas from '@studio/features/bottle-engraving/components/BottleCanvas.jsx';

import ColorPicker from '@studio/features/3d-configurator/components/ColorPicker.jsx';

import ProductStudioChrome from './ProductStudioChrome.jsx';
import { LOGO_ACCEPT, useBottleLogoStudio } from './useBottleLogoStudio.js';

import './product-studio.scss';

const LazyConfiguratorColorsWorkspace = lazy(() => import('./ConfiguratorColorsWorkspace.jsx'));

/**
 * Unified bottle studio: workspace "colors" (3D palette) or "logo" (upload, placement, exports).
 * Full navigation between tabs uses /configurator/ and /bottle so both Vite entries stay in sync.
 */
export default function ProductStudioPage({ workspace }) {
  return (
    <div className="bottle-app product-studio">
      {workspace === 'logo' ? <LogoStudioColumns /> : <ColorsStudioColumns />}
    </div>
  );
}

function LogoStudioColumns() {
  const logo = useBottleLogoStudio();
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  return (
    <>
      <aside className="bottle-panel">
        <ProductStudioChrome workspace="logo" />

        <h1>Bottle logo mockup</h1>
        <p className="lead">
          Upload your logo, position it inside the highlighted safe zone on the 3D bottle, then download a JPEG mockup
          for approval.
        </p>
        <p className="studio-preview-hint">
          On this screen size, the live 3D preview is above.{' '}
          <a href="#bottle-3d-preview">Jump to preview</a>
        </p>

        <div>
          <div className="field-label">Logo file</div>
          <label className="btn secondary" style={{ width: '100%' }}>
            <input type="file" accept={LOGO_ACCEPT} hidden onChange={logo.onUploadInput} />
            Upload logo
          </label>
          <p className="hint">PNG, JPG, SVG, BMP, WebP. Drag on the bottle to move; scroll to resize.</p>
        </div>

        {logo.warn ? <div className="warn">{logo.warn}</div> : null}
        {logo.error ? <div className="error">{logo.error}</div> : null}
        {logo.uploadMeta ? (
          <p className="hint">
            Saved: {logo.uploadMeta.filename}
            {logo.uploadMeta.width ? ` · ${logo.uploadMeta.width}×${logo.uploadMeta.height}px` : ''}
          </p>
        ) : null}

        <div>
          <div className="field-label">Placement</div>
          <div className="toggle-group" role="group" aria-label="Placement zone">
            <button
              type="button"
              className={logo.placement === 'front' ? 'active' : ''}
              onClick={() => {
                logo.setPlacement('front');
                logo.resetLayout();
              }}
            >
              Front
            </button>
            <button
              type="button"
              className={logo.placement === 'side' ? 'active' : ''}
              onClick={() => {
                logo.setPlacement('side');
                logo.resetLayout();
              }}
            >
              Side
            </button>
          </div>
          <p className="hint">{logo.placementLabel}. Orange box = safe engraving zone.</p>
        </div>

        <div>
          <div className="field-label">Engraving preview</div>
          <div className="toggle-group" role="group" aria-label="Engraving preview">
            <button type="button" className={logo.engraveOn ? 'active' : ''} onClick={() => logo.setEngraveOn(true)}>
              On
            </button>
            <button type="button" className={!logo.engraveOn ? 'active' : ''} onClick={() => logo.setEngraveOn(false)}>
              Off
            </button>
          </div>
        </div>

        <div>
          <div className="field-label">Logo size</div>
          <div className="slider-row">
            <span className="hint">S</span>
            <input
              type="range"
              min={0.35}
              max={logo.sliderMax}
              step={0.01}
              value={Math.min(logo.logoScale, logo.sliderMax)}
              onChange={(e) => logo.setLogoScale(Number(e.target.value))}
            />
            <span className="hint">L</span>
          </div>
        </div>

        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={logo.resetLayout}>
            Reset position
          </button>
        </div>

        <div className="btn-row">
          <button type="button" className="btn" disabled={logo.busy || !logo.baseTexture} onClick={() => void logo.downloadMockup()}>
            Download mockup
          </button>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn secondary"
            disabled={logo.busy || !logo.lastRasterFile}
            onClick={() => void logo.downloadBmpForLaser()}
          >
            Download BMP (laser)
          </button>
        </div>
      </aside>

      <section id="bottle-3d-preview" className="bottle-canvas-wrap" aria-label="3D bottle preview">
        {!sceneReady ? (
          <div className="bottle-canvas-boot" role="status" aria-live="polite">
            <div className="bottle-canvas-boot-inner">
              <div className="spinner" />
              <p>Loading 3D preview…</p>
            </div>
          </div>
        ) : null}
        {logo.busy ? (
          <div className="spinner-overlay" aria-busy="true">
            <div className="spinner" />
          </div>
        ) : null}
        <BottleCanvas
          placement={logo.placement}
          displayTexture={logo.displayTexture}
          dragOffset={logo.dragOffset}
          setDragOffset={logo.setDragOffset}
          logoScale={logo.logoScale}
          setLogoScale={logo.setLogoScale}
          dragging={logo.dragging}
          setDragging={logo.setDragging}
          dragStartRef={logo.dragStartRef}
          onGlReady={logo.onGlReady}
          onSceneReady={onSceneReady}
        />
      </section>
    </>
  );
}

function ColorsStudioColumns() {
  const bottleState = useMemo(
    () =>
      proxy({
        current: 'body',
        colors: {
          body: '#c4cad4',
          cap: '#aeb6c2',
          neck: '#9ca3af'
        }
      }),
    []
  );

  const updateBottleCurrent = (value) => {
    bottleState.current = value === null || value === undefined ? 'body' : value;
  };

  const updateBottleColor = (pro, value) => {
    bottleState.colors[pro] = value;
  };

  return (
    <>
      <aside className="bottle-panel">
        <ProductStudioChrome workspace="colors" />

        <h1>Studio colors</h1>
        <p className="lead">Orbit the bottle, tap body, cap, or neck, then dial the hex color below.</p>
        <p className="studio-preview-hint">
          On this screen size, the 3D bottle is above. <a href="#bottle-3d-preview">Jump to preview</a>
        </p>

        <ColorPicker variant="inline" state={bottleState} updateColor={updateBottleColor} />
      </aside>

      <section id="bottle-3d-preview" className="bottle-canvas-wrap" aria-label="3D bottle colors">
        <Suspense
          fallback={
            <div className="configurator-suspense-fallback" role="status" aria-live="polite">
              <p style={{ margin: 0 }}>Loading 3D preview…</p>
            </div>
          }
        >
          <LazyConfiguratorColorsWorkspace bottleState={bottleState} updateBottleCurrent={updateBottleCurrent} />
        </Suspense>
      </section>
    </>
  );
}
