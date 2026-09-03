import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import type { BalanceParams, TailParams, WingParams } from '../aero/params'
import { Airframe } from './Airframe'

/**
 * The viewport.
 *
 * The canvas keeps a transparent background so the panel's own gradient shows
 * through, which saves painting the same colour twice and keeps the wing
 * sitting in the page rather than in a black box.
 */
export function Studio({
  wing,
  tail,
  balance,
  neutralPoint,
}: {
  wing: WingParams
  tail: TailParams
  balance: BalanceParams
  neutralPoint: number
}) {
  // Framed off the starting span. The results strip leaves the viewport wide
  // and short, so horizontal room is plentiful and the wing can sit closer than
  // a square viewport would allow. The camera is not re-fitted afterwards: an
  // orbit the user set should survive a slider drag.
  const reach = Math.max(wing.span, tail.arm * 1.6) * 0.72

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [reach * 0.55, reach * 0.42, reach], fov: 38, near: 0.1, far: 500 }}
    >
      <hemisphereLight args={['#93b6c4', '#141a1e', 0.55]} />
      <directionalLight position={[6, 12, 8]} intensity={2.1} />
      <directionalLight position={[-9, 4, -6]} intensity={0.5} color="#7fd4dc" />

      <Airframe
        wing={wing}
        tail={tail}
        balance={balance}
        neutralPoint={neutralPoint}
      />

      <Grid
        position={[0, -2.4, 0]}
        args={[40, 40]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#22303a"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#2f4652"
        fadeDistance={48}
        fadeStrength={1.4}
        infiniteGrid
        followCamera={false}
      />

      <OrbitControls
        makeDefault
        enablePan
        minDistance={1.5}
        maxDistance={140}
        target={[0, 0, tail.arm * 0.3]}
      />
    </Canvas>
  )
}
