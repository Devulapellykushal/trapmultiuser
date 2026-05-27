import { Html, useProgress } from '@react-three/drei';

export default function Loader() {
  const { progress, active } = useProgress();
  const pct = Math.min(100, Math.round(progress || 0));
  return (
    <Html center>
      <div className="canvas-loader-pill" role="status" aria-live="polite">
        <span className="canvas-loader-spinner" aria-hidden="true" />
        <span>{active ? `Loading 3D… ${pct}%` : 'Loading 3D…'}</span>
      </div>
    </Html>
  );
}
