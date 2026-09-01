import { useEffect, useMemo } from 'react'
import type { WingParams } from '../aero/params'
import { buildWingGeometry } from '../geometry/wingMesh'

/**
 * The lofted wing.
 *
 * Geometry is rebuilt only when the wing parameters change, and the previous
 * buffers are released when it is - dragging a slider across its full range
 * would otherwise leak a geometry per frame.
 */
export function WingModel({ wing }: { wing: WingParams }) {
  const geometry = useMemo(() => buildWingGeometry(wing), [wing])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#b9c6ce"
        metalness={0.35}
        roughness={0.42}
        envMapIntensity={0.6}
      />
    </mesh>
  )
}
