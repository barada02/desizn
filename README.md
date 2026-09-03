# desizn

A parametric wing studio in the browser. Move a slider, and a real aerodynamic
solver runs: the 3D shape, the spanwise load, the drag polar and the flight
envelope all move together.

It is a living spreadsheet with a wing attached — closer to a design playground
than to CAD.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # the aero core, ~160 tests
npm run build    # typecheck + production build
npm run lint
```

## What it computes

Nothing here is a lookup table. Every number comes out of a solver that runs
when you move the slider.

| | |
|---|---|
| **Sections** | NACA 4-digit profiles generated from the code — camber line, thickness, surface coordinates. Zero-lift angle from thin airfoil theory, integrated numerically. |
| **Lift** | Two solvers. Prandtl's lifting-line theory, and a vortex-lattice method that lays horseshoe vortices along the real quarter-chord line. You choose which one answers. |
| **Drag** | Induced drag from the wake, plus a profile-drag buildup: turbulent flat-plate skin friction at the Reynolds number, a thickness form factor, scaled by wetted area. |
| **Stability** | Neutral point and static margin, with the tailplane solved as the lifting surface it is rather than approximated. |
| **Stall** | Found by the critical-section method: each station is solved for the angle at which it reaches its own section stall, and the wing lets go at the lowest. |
| **Envelope** | Stall speed, manoeuvre speed, dive speed and the V-n diagram, against FAR-23 normal-category limit loads. |
| **Atmosphere** | ISA to 20 km, driving density, viscosity and speed of sound. |

## Two theories, and why both

The solver is switchable, and the panel says what each one can and cannot see.

**Lifting line** is exact for an elliptical wing and quick to reason about, but
it models the whole wing as a single straight line — so sweep and dihedral change
the picture and nothing else. Below about aspect ratio four it falls apart: on a
square wing it overpredicts the lift slope by nearly 40%.

**Vortex lattice** sees the geometry. Sweep costs lift roughly with its cosine,
dihedral costs a little, and low aspect ratios stay believable. With a single
chordwise row it reads a few percent under a fully converged lifting-surface
solution.

Being able to switch between them shows exactly where a model's assumptions stop
holding. That is worth more than quietly picking one and hiding the seam.

## Honesty about the model

The app says where it stops being trustworthy instead of drawing a confident
line:

- **No fuselage.** A real one is destabilising and would move the neutral point
  forward by roughly 10% of MAC, so reported static margins are optimistic. The
  results carry a `fuselageAllowance` rather than leaving it unsaid.
- **Linear theory has no stall.** Past the point where a section would let go,
  the drag polar is drawn faintly and the readouts say the numbers are optimistic.
- **The boom in the 3D view is scenery.** It stops the tailplane appearing to
  float; it contributes no lift, drag or pitching moment.

## How it is put together

```
src/
  aero/        pure TypeScript — no React, no Three.js, no DOM
    params        the one source of truth for what can change, and how far
    airfoil       NACA sections, generated
    planform      areas, aspect ratio, MAC, sweep conversions
    llt           Prandtl lifting-line
    vlm           vortex lattice
    solver        the facade both hide behind
    drag  stability  envelope  polar  atmosphere
    evaluate      parameters in, results out — the whole core behind one call
  geometry/    parameters → BufferGeometry
  scene/       React Three Fiber
  charts/      hand-rolled SVG
  ui/          controls and readouts
  state/       one zustand store
```

The core imports nothing from React or Three.js. That is what makes it testable
against published results, and it is what will let an agent call exactly the same
functions the sliders do.

Bounds live in `params.ts` and nowhere else: the sliders, the tests and the
future agent schema all read the same table.

## How the numbers are checked

Tests assert against results that do not come from this code:

- An elliptical wing returns span efficiency 1.00 — from both solvers, and in
  the lattice's case out of a Trefftz-plane integration that knows nothing about
  the expectation.
- Lifting-line's lift slope matches the closed form `a₀/(1 + a₀/πAR)` to three
  decimals.
- A rectangular AR-6 wing lands in the published 0.92–0.97 span-efficiency band.
- NACA 2412's zero-lift angle comes out at −2.07°, the published value.
- Span efficiency peaks between taper 0.3 and 0.5, reproducing the textbook
  optimum from the physics rather than from a hardcoded curve.
- Best lift-to-drag falls where induced drag has grown to meet profile drag.
- The 3D mesh's signed volume is positive and correctly sized — one number
  proving the loft is closed and outward-wound.

## Where it is going

Phases 1–4 are done: the wing, the drag polar, the tail and envelope, and the
vortex lattice. Still ahead: a fuselage, propulsion, and a WebMCP tool surface so
an agent can drive the same store the sliders do — reading results freely, but
paying a visible, undoable call to change what you see.
