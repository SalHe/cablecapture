/**
 * Circle Packing Algorithm — packs multiple circles into a minimal enclosing circle.
 *
 * Approach (two-phase):
 *   Phase 1 — Greedy placement: circles are placed one by one (largest first),
 *             each positioned tangent to two already-placed circles.
 *   Phase 2 — Force-directed refinement: overlap-resolving and wall-inward
 *             forces iteratively shrink the enclosing radius.
 *
 * Math references:
 *   - Tangent positions: intersection of two circles (d1 = rᵢ + rₙₑw, d2 = rⱼ + rₙₑw)
 *   - Enclosing radius:  R = max_i( ‖pos_i‖ + r_i )
 */

// ────────────────────────── Types ──────────────────────────

export interface Point {
  x: number
  y: number
}

export interface PackingResult {
  positions: Point[]
  enclosingR: number
}

// ────────────────────────── Geometry Helpers ───────────────

/** Euclidean distance between two 2D points. */
function dist(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Distance from origin. */
function norm(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y)
}

/**
 * Compute up to two intersection points of two circles.
 * Circle A: center c1 with radius r1, Circle B: center c2 with radius r2.
 * Returns array of 0, 1, or 2 {x, y} points.
 */
function circleIntersection(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const d = dist(c1, c2)
  const results: Point[] = []

  // Circles too far apart or one contains the other — no intersection
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d < 1e-9) {
    return results
  }

  // Distance from c1 to the radical line
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const hSq = r1 * r1 - a * a
  const h = hSq > 0 ? Math.sqrt(hSq) : 0

  // Midpoint along the line c1 → c2
  const dx = (c2.x - c1.x) / d
  const dy = (c2.y - c1.y) / d
  const mx = c1.x + a * dx
  const my = c1.y + a * dy

  // Perpendicular direction
  const px = -dy
  const py = dx

  results.push({ x: mx + h * px, y: my + h * py })
  if (h > 1e-9) {
    results.push({ x: mx - h * px, y: my - h * py })
  }

  return results
}

// ──────────────────── Packing State ────────────────────────

/**
 * Calculate the minimum enclosing radius for the current configuration.
 */
function enclosingRadius(positions: Point[], radii: number[]): number {
  let maxR = 0
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) continue // skip unplaced circles during greedy phase
    const r = norm(positions[i]) + radii[i]
    if (r > maxR) maxR = r
  }
  return maxR
}

/**
 * Check whether circle `idx` overlaps any already-placed circle.
 */
function hasOverlap(positions: Point[], radii: number[], idx: number, placed: Set<number>): boolean {
  for (const j of placed) {
    const d = dist(positions[idx], positions[j])
    if (d < radii[idx] + radii[j] - 1e-9) return true
  }
  return false
}

// ──────────────────── Phase 1: Greedy Placement ────────────

/**
 * Greedy circle packing — places circles largest-first, each tangent to
 * two existing circles (or one + origin), picking the position that
 * minimises the enclosing radius.
 */
function greedyPack(radii: number[]): { positions: Point[]; enclosingR: number } {
  const n = radii.length
  if (n === 0) return { positions: [], enclosingR: 0 }
  if (n === 1) return { positions: [{ x: 0, y: 0 }], enclosingR: radii[0] }

  // Sort by radius descending, remember original indices
  const indexed = radii.map((r, i) => ({ r, idx: i }))
  indexed.sort((a, b) => b.r - a.r)

  const positions: Point[] = new Array(n)

  // Place largest circle at origin
  positions[indexed[0].idx] = { x: 0, y: 0 }
  const placed = new Set<number>([indexed[0].idx])

  for (let k = 1; k < n; k++) {
    const { r, idx } = indexed[k]
    let bestPos: Point = { x: 0, y: r + radii[indexed[0].idx] } // fallback: stack on largest
    let bestR = Infinity

    const placedArr = [...placed]

    // Try touching every pair of already-placed circles
    for (let a = 0; a < placedArr.length; a++) {
      for (let b = a + 1; b < placedArr.length; b++) {
        const ia = placedArr[a]
        const ib = placedArr[b]
        const candidates = circleIntersection(
          positions[ia], radii[ia] + r,
          positions[ib], radii[ib] + r
        )
        for (const pos of candidates) {
          positions[idx] = pos
          if (!hasOverlap(positions, radii, idx, placed)) {
            const er = enclosingRadius(positions, radii)
            if (er < bestR) {
              bestR = er
              bestPos = { ...pos }
            }
          }
        }
      }
    }

    // Also try touching one existing circle + origin-direction constraint
    for (const ia of placedArr) {
      const ca = positions[ia]
      const da = radii[ia] + r
      const ang = Math.atan2(ca.y, ca.x)

      const testPos: Point = { x: ca.x + Math.cos(ang) * da, y: ca.y + Math.sin(ang) * da }
      positions[idx] = testPos
      if (!hasOverlap(positions, radii, idx, placed)) {
        const er = enclosingRadius(positions, radii)
        if (er < bestR) {
          bestR = er
          bestPos = { ...testPos }
        }
      }

      const testPos2: Point = { x: ca.x - Math.cos(ang) * da, y: ca.y - Math.sin(ang) * da }
      positions[idx] = testPos2
      if (!hasOverlap(positions, radii, idx, placed)) {
        const er = enclosingRadius(positions, radii)
        if (er < bestR) {
          bestR = er
          bestPos = { ...testPos2 }
        }
      }
    }

    positions[idx] = bestPos
    placed.add(idx)
  }

  // Centre the entire configuration (translate centroid to origin)
  let cx = 0, cy = 0
  for (const p of positions) { cx += p.x; cy += p.y }
  cx /= n; cy /= n
  for (const p of positions) { p.x -= cx; p.y -= cy }

  return {
    positions,
    enclosingR: enclosingRadius(positions, radii)
  }
}

// ──────────────────── Phase 2: Force-Directed Refinement ───

/**
 * Force-directed refinement: iteratively resolve overlaps and pull circles inward.
 * Returns the refined enclosing radius.
 */
function forceRefine(positions: Point[], radii: number[], maxIter = 400): number {
  const n = positions.length
  if (n <= 1) return enclosingRadius(positions, radii)

  for (let iter = 0; iter < maxIter; iter++) {
    const forces: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    let maxOverlap = 0
    let maxWallPen = 0

    // ── Repulsive force (resolve overlaps) ──
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        const minD = radii[i] + radii[j]

        if (d < minD && d > 1e-10) {
          const overlap = minD - d
          if (overlap > maxOverlap) maxOverlap = overlap
          const fx = (dx / d) * overlap * 0.55
          const fy = (dy / d) * overlap * 0.55
          forces[i].x += fx
          forces[i].y += fy
          forces[j].x -= fx
          forces[j].y -= fy
        } else if (d < 1e-10) {
          // Coincident centres — nudge apart
          forces[i].x += 0.1
          forces[i].y += 0.1
          forces[j].x -= 0.1
          forces[j].y -= 0.1
        }
      }
    }

    // ── Current enclosing radius ──
    const curR = enclosingRadius(positions, radii)

    // ── Wall force (push inward if beyond enclosing circle) ──
    for (let i = 0; i < n; i++) {
      const d = norm(positions[i])
      const maxD = curR - radii[i]
      if (d > maxD && d > 1e-10) {
        const pen = d - maxD
        if (pen > maxWallPen) maxWallPen = pen
        forces[i].x -= (positions[i].x / d) * pen * 0.65
        forces[i].y -= (positions[i].y / d) * pen * 0.65
      }
      // Very slight centripetal pull
      if (d > 1e-10) {
        forces[i].x -= positions[i].x * 0.0008
        forces[i].y -= positions[i].y * 0.0008
      }
    }

    // ── Apply forces with adaptive damping ──
    const damping = 0.92
    for (let i = 0; i < n; i++) {
      positions[i].x += forces[i].x * damping
      positions[i].y += forces[i].y * damping
    }

    // ── Early exit if stable ──
    if (maxOverlap < 1e-6 && maxWallPen < 1e-6) break
  }

  return enclosingRadius(positions, radii)
}

// ──────────────────── Public API ───────────────────────────

/**
 * Main entry point.
 *
 * @param radii — radii of each cable (half its diameter)
 * @returns `positions[i]` is the centre of cable `i`, and `enclosingR` is the
 *   minimum enclosing outer radius.  The outer diameter = 2 × enclosingR.
 */
export function packCircles(radii: number[]): PackingResult {
  if (!radii || radii.length === 0) {
    return { positions: [], enclosingR: 0 }
  }

  // Deep-copy radii so we don't mutate caller's array
  const r = [...radii]

  // Phase 1: greedy initial layout
  const result = greedyPack(r)

  // Phase 2: force-directed refinement
  result.enclosingR = forceRefine(result.positions, r)

  return result
}

/**
 * Re-pack after the user dragged one cable to a new position.
 * All other cables stay where they are; only the force-refine step runs
 * (which adjusts positions and returns the new enclosing radius).
 *
 * @param radii  — cable radii
 * @param positions — current positions (with one updated from drag)
 * @returns new enclosing radius
 */
export function repackAfterDrag(radii: number[], positions: Point[]): number {
  return forceRefine(positions, radii, 250)
}
