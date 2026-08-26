import { useCallback, useMemo, useState } from 'react';
import { proxy, useSnapshot } from 'valtio';

import StudioReloadFab from '@studio/components/StudioReloadFab.jsx';

import BottleCanvas from '@studio/features/bottle-engraving/components/BottleCanvas.jsx';
import { useBottleLabelTexture } from '@studio/features/bottle-engraving/hooks/useBottleLabelTexture.js';
import ColorPicker from '@studio/features/3d-configurator/components/ColorPicker.jsx';

import { LOGO_ACCEPT, useBottleLogoStudio } from './useBottleLogoStudio.js';

import './product-studio.scss';

function ConfigureBottleChrome() {
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
            <img src="/assets/2d/Quake_Logo.png" alt="" />
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

      <nav className="product-studio-workspace-tabs" aria-label="Other studio layouts">
        <a href="/configurator/">Colors only</a>
        <a href="/bottle">Logo only</a>
        <a href="/configurebottle" className="active" aria-current="page">
          All in one
        </a>
      </nav>

      <p className="lead" style={{ marginTop: 0 }}>
        Adjust body, cap, and neck colors, then upload and place your logo on the same bottle preview.
      </p>
      <p className="studio-preview-hint">
        On this screen size, the live 3D preview is above. <a href="#bottle-3d-preview">Jump to preview</a>
      </p>
    </>
  );
}

/**
 * Single URL: colors + logo on one 3D view (`BottleCanvas` + `BottleWithLogo` with live materials).
 */
export default function ConfigureBottlePage() {
  const logo = useBottleLogoStudio();
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  const bottleState = useMemo(
    () =>
      proxy({
        current: 'body',
        colors: {
          body: '#c4cad4',
          cap: '#aeb6c2',
          neck: '#9ca3af'
        },
        brandName: '',
        tagline: ''
      }),
    []
  );

  const bottleSnap = useSnapshot(bottleState);

  const labelTexture = useBottleLabelTexture(bottleSnap.brandName, bottleSnap.tagline);

  const updateBottleColor = (pro, value) => {
    bottleState.colors[pro] = value;
  };

  return (
    <div className="bottle-app product-studio configure-bottle-page">
      <aside className="bottle-panel configure-bottle-panel">
        <ConfigureBottleChrome />

        <h1>Part color</h1>
        <div className="field-label">Edit</div>
        <div className="toggle-group" role="group" aria-label="Bottle part for color">
          {['body', 'cap', 'neck'].map((key) => (
            <button
              key={key}
              type="button"
              className={bottleSnap.current === key ? 'active' : ''}
              onClick={() => {
                bottleState.current = key;
              }}
            >
              {key}
            </button>
          ))}
        </div>
        <ColorPicker variant="inline" state={bottleState} updateColor={updateBottleColor} />

        <h1 style={{ marginTop: '1.25rem' }}>Bottle label</h1>
        <p className="hint" style={{ marginTop: 0 }}>
          Shown on the bottle below the logo area. Edited here only (not draggable on the 3D view).
        </p>
        <div className="bottle-text-fields">
          <div>
            <div className="field-label">Bottle name or brand</div>
            <input
              type="text"
              className="bottle-text-input"
              placeholder="e.g. Acme Spirits"
              maxLength={48}
              value={bottleSnap.brandName}
              onChange={(e) => {
                bottleState.brandName = e.target.value;
              }}
              autoComplete="off"
            />
          </div>
          <div>
            <div className="field-label">Tagline</div>
            <input
              type="text"
              className="bottle-text-input"
              placeholder="e.g. Small batch · Est. 2024"
              maxLength={72}
              value={bottleSnap.tagline}
              onChange={(e) => {
                bottleState.tagline = e.target.value;
              }}
              autoComplete="off"
            />
          </div>
        </div>

        <h1 style={{ marginTop: '1.25rem' }}>Logo</h1>
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
          bottleColors={bottleState.colors}
          onPickPart={(part) => {
            bottleState.current = part;
          }}
          labelTexture={labelTexture}
        />
      </section>
    </div>
  );
}
