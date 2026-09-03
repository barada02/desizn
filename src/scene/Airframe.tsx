import { useEffect, useMemo } from 'react'
import { DEG, type BalanceParams, type TailParams, type WingParams } from '../aero/params'
import { leadingEdgeX, planform } from '../aero/planform'
import { tailAsWing } from '../aero/stability'
import { buildWingGeometry } from '../geometry/wingMesh'

/**
 * The airframe: wing, tailplane, and the two marks that pitch stability is
 * argued about - where the mass sits and where the neutral point is.
 */

function Surface({
  wing,
  positionZ = 0,
  pitch = 0,
  colour,
}: {
  wing: WingParams
  positionZ?: number
  /** Rigging angle, degrees; positive pitches the leading edge up */
  pitch?: number
  colour: string
}) {
  const geometry = useMemo(() => buildWingGeometry(wing), [wing])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      position={[0, 0, positionZ]}
      rotation={[pitch * DEG, 0, 0]}
    >
      <meshStandardMaterial
        color={colour}
        metalness={0.35}
        roughness={0.42}
        envMapIntensity={0.6}
      />
    </mesh>
  )
}

export function Airframe({
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
  const geometry = planform(wing)
  const tailWing = useMemo(() => tailAsWing(tail), [tail])

  // Both marks are measured aft from the leading edge of the mean chord.
  const macLeadingEdge = leadingEdgeX(wing, geometry.yMac)
  const cgZ = macLeadingEdge + balance.cg * geometry.mac
  const npZ = macLeadingEdge + neutralPoint * geometry.mac
  const markerRadius = Math.max(0.05, geometry.mac * 0.075)

  return (
    <group>
      <Surface wing={wing} colour="#b9c6ce" />
      <Surface wing={tailWing} positionZ={tail.arm} pitch={tail.incidence} colour="#9fb0ba" />

      {/*
        A slim boom so the tailplane does not appear to float. It is a visual
        aid only - there is no fuselage in the model, and nothing here
        contributes lift, drag or a pitching moment.
      */}
      <mesh position={[0, 0, tail.arm / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[geometry.mac * 0.07, geometry.mac * 0.05, tail.arm, 12]} />
        <meshStandardMaterial color="#7d8d97" metalness={0.2} roughness={0.6} />
      </mesh>

      {/* Centre of gravity */}
      <mesh position={[0, 0, cgZ]}>
        <sphereGeometry args={[markerRadius, 20, 16]} />
        <meshStandardMaterial color="#46b4bc" emissive="#123339" roughness={0.35} />
      </mesh>

      {/* Neutral point - stable while the CG mark sits ahead of this one */}
      <mesh position={[0, 0, npZ]}>
        <sphereGeometry args={[markerRadius * 0.8, 20, 16]} />
        <meshStandardMaterial color="#5eb476" emissive="#12301c" roughness={0.35} />
      </mesh>
    </group>
  )
}
