import { Suspense } from 'react';

import { Float, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { STUDIO_3D_BACKGROUND } from '@studio/features/bottle-engraving/constants/bottle.js';
import { proxy } from 'valtio';

/*
 * Previously: multi-model picker (Shoe, Rocket, Axe, Insect, Teapot), per-model valtio state,
 * ModelPicker sidebar, and footer link to Madewill/3d-product-configurator.
 * Now: single procedural bottle only; picker and template chrome removed.
 */

// import Axe from './Axe';
import ColorPicker from './ColorPicker';
import ConfiguratorBottle from './ConfiguratorBottle';
// import Insect from './Insect';
import Loader from './Loader';

// import ModelPicker from './ModelPicker';
// import Rocket from './Rocket';
// import Shoe from './Shoe';
// import Teapot from './Teapot';

const BottleState = proxy({
  current: 'body',
  colors: {
    body: '#c4cad4',
    cap: '#aeb6c2',
    neck: '#9ca3af'
  }
});

// const RocketState = proxy({ ... });
// const AxeState = proxy({ ... });
// const ShoeState = proxy({ ... });
// const InsectState = proxy({ ... });
// const TeapotState = proxy({ ... });

export default function ProductConfiguratorApp() {
  const updateBottleCurrent = (value) => {
    BottleState.current = value === null || value === undefined ? 'body' : value;
  };
  const updateBottleColor = (pro, value) => {
    BottleState.colors[pro] = value;
  };

  return (
    <>
      {/* <ModelPicker updateSelectedModel={updateSelectedModel} /> */}
      <ColorPicker state={BottleState} updateColor={updateBottleColor} />
      <div className='configurator-canvas-wrap'>
        <Canvas
          shadows
          camera={{ position: [1.15, 0.35, 2], fov: 45 }}
          gl={{
            antialias: true,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
          }}
          dpr={[1, 2]}
          onPointerMissed={() => updateBottleCurrent(null)}
        >
          <color attach="background" args={[STUDIO_3D_BACKGROUND]} />
          <ambientLight intensity={0.88} />
          <spotLight intensity={1.02} penumbra={0.92} position={[7, 14, 10]} castShadow />
          <directionalLight position={[-5, 8, -4]} intensity={0.45} />
          <directionalLight position={[4, 3, 6]} intensity={0.35} />
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 1.1]} position={[0, -1, 0]}>
            <planeGeometry args={[100, 100]} />
            <shadowMaterial opacity={0.2} />
          </mesh>
          <Suspense fallback={<Loader />}>
            <Float
              speed={1}
              rotationIntensity={0.35}
              floatIntensity={0.25}
              floatingRange={[0, 0.12]}
            >
              <ConfiguratorBottle
                castShadow
                colors={BottleState.colors}
                updateCurrent={updateBottleCurrent}
              />
            </Float>
          </Suspense>
          <OrbitControls maxDistance={5} minDistance={1.5} makeDefault />
        </Canvas>
      </div>
      {/* Removed: GitHub / Madewill footer badge */}
    </>
  );
}
