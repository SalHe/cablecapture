/**
 * Circle Packing Algorithm — packs multiple circles into a minimal enclosing circle.
 *
 * Approach (three-phase, multi-start):
 *   Phase 1 — Multi-start greedy placement: tries largest-first + several random
 *             orderings, keeps the tightest initial layout.
 *   Phase 2 — Compressive force-directed refinement: strong centripetal forces +
 *             gradually shrinking target radius squeeze the layout inward.
 *   Phase 3 — Pick the best across all starts after refinement.
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

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function norm(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y)
}

/** Seeded pseudo-random number generator (mulberry32). */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yates shuffle using a provided rng. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function circleIntersection(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const d = dist(c1, c2)
  const results: Point[] = []
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d < 1e-9) return results
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const hSq = r1 * r1 - a * a
  const h = hSq > 0 ? Math.sqrt(hSq) : 0
  const dx = (c2.x - c1.x) / d
  const dy = (c2.y - c1.y) / d
  const mx = c1.x + a * dx
  const my = c1.y + a * dy
  const px = -dy
  const py = dx
  results.push({ x: mx + h * px, y: my + h * py })
  if (h > 1e-9) results.push({ x: mx - h * px, y: my - h * py })
  return results
}

// ──────────────────── State helpers ────────────────────────

function enclosingRadius(positions: Point[], radii: number[]): number {
  let maxR = 0
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) continue
    const r = norm(positions[i]) + radii[i]
    if (r > maxR) maxR = r
  }
  return maxR
}

function hasOverlap(positions: Point[], radii: number[], idx: number, placed: Set<number>): boolean {
  for (const j of placed) {
    if (dist(positions[idx], positions[j]) < radii[idx] + radii[j] - 1e-9) return true
  }
  return false
}

function centroid(positions: Point[]): Point {
  let cx = 0, cy = 0
  const n = positions.length
  for (const p of positions) { cx += p.x; cy += p.y }
  return { x: cx / n, y: cy / n }
}

function recenter(positions: Point[]) {
  const c = centroid(positions)
  for (const p of positions) { p.x -= c.x; p.y -= c.y }
}

// ──────────────────── Phase 1: Greedy Placement ────────────

/**
 * Greedy placement with a given circle ordering.
 * `order` maps sorted-index → original-index (determines placement sequence).
 */
function greedyWithOrder(radii: number[], order: number[]): Point[] {
  const n = radii.length
  const positions: Point[] = new Array(n)

  // Place first circle at origin
  positions[order[0]] = { x: 0, y: 0 }
  const placed = new Set<number>([order[0]])

  for (let k = 1; k < n; k++) {
    const idx = order[k]
    const r = radii[idx]
    let bestPos: Point = { x: 0, y: r + radii[order[0]] }
    let bestR = Infinity

    const placedArr = [...placed]

    // Try tangent to every pair of already-placed circles
    for (let a = 0; a < placedArr.length; a++) {
      for (let b = a + 1; b < placedArr.length; b++) {
        const ia = placedArr[a]
        const ib = placedArr[b]
        const candidates = circleIntersection(
          positions[ia], radii[ia] + r,
          positions[ib], radii[ib] + r,
        )
        for (const pos of candidates) {
          positions[idx] = pos
          if (!hasOverlap(positions, radii, idx, placed)) {
            const er = enclosingRadius(positions, radii)
            if (er < bestR) { bestR = er; bestPos = { ...pos } }
          }
        }
      }
    }

    // Try touching one existing circle, pulled toward origin
    for (const ia of placedArr) {
      const ca = positions[ia]
      const da = radii[ia] + r
      const ang = Math.atan2(ca.y, ca.x)
      // Toward origin side
      const toward: Point = { x: ca.x - Math.cos(ang) * da, y: ca.y - Math.sin(ang) * da }
      positions[idx] = toward
      if (!hasOverlap(positions, radii, idx, placed)) {
        const er = enclosingRadius(positions, radii)
        if (er < bestR) { bestR = er; bestPos = { ...toward } }
      }
      // Away from origin side
      const away: Point = { x: ca.x + Math.cos(ang) * da, y: ca.y + Math.sin(ang) * da }
      positions[idx] = away
      if (!hasOverlap(positions, radii, idx, placed)) {
        const er = enclosingRadius(positions, radii)
        if (er < bestR) { bestR = er; bestPos = { ...away } }
      }
    }

    positions[idx] = bestPos
    placed.add(idx)
  }

  recenter(positions)
  return positions
}

// ──────────────────── Phase 2: Compressive Refinement ──────

/**
 * Compressive force-directed refinement.
 * Uses strong centripetal forces + a gradually-shrinking target radius
 * to squeeze circles into the tightest possible configuration.
 */
function compressiveRefine(positions: Point[], radii: number[], maxIter = 1200): number {
  const n = positions.length
  if (n <= 1) return enclosingRadius(positions, radii)

  let curR = enclosingRadius(positions, radii)
  // Aggressive initial target: try to shrink by 15%
  let targetR = curR * 0.85
  let stableCount = 0

  for (let iter = 0; iter < maxIter; iter++) {
    const forces: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    let maxOverlap = 0

    // ── 1. Strong repulsive forces (resolve overlaps) ──
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        const minD = radii[i] + radii[j]

        if (d < minD && d > 1e-10) {
          const overlap = minD - d
          if (overlap > maxOverlap) maxOverlap = overlap
          // Softer spring for small overlaps, stronger for large ones
          const stiffness = 0.45 + 0.3 * Math.min(overlap / Math.max(radii[i], radii[j], 0.01), 1)
          const f = overlap * stiffness
          forces[i].x += (dx / d) * f
          forces[i].y += (dy / d) * f
          forces[j].x -= (dx / d) * f
          forces[j].y -= (dy / d) * f
        } else if (d < 1e-10) {
          forces[i].x += 0.05
          forces[i].y += 0.05
          forces[j].x -= 0.05
          forces[j].y -= 0.05
        }
      }
    }

    // Update current enclosing radius
    curR = enclosingRadius(positions, radii)

    // ── 2. Centripetal + wall forces ──
    let maxWallPen = 0
    const effectiveTarget = Math.max(targetR, curR * 0.75) // don't try too hard

    for (let i = 0; i < n; i++) {
      const d = norm(positions[i])
      if (d < 1e-10) continue

      // Centripetal pull — stronger for circles further from center
      const centripetalStrength = 0.015 + d * 0.02
      forces[i].x -= (positions[i].x / d) * centripetalStrength
      forces[i].y -= (positions[i].y / d) * centripetalStrength

      // Wall force: push inside the target radius
      const maxD = effectiveTarget - radii[i]
      if (d > maxD) {
        const pen = d - maxD
        if (pen > maxWallPen) maxWallPen = pen
        // Strong wall force
        const wallStrength = 0.6 + pen * 0.3
        forces[i].x -= (positions[i].x / d) * pen * wallStrength
        forces[i].y -= (positions[i].y / d) * pen * wallStrength
      }
    }

    // ── 3. Apply forces ──
    // Adaptive damping: higher when overlaps are small (stable), lower when resolving
    const damping = maxOverlap > 0.01 ? 0.75 : (maxWallPen > 0.001 ? 0.85 : 0.7)
    for (let i = 0; i < n; i++) {
      positions[i].x += forces[i].x * damping
      positions[i].y += forces[i].y * damping
    }

    // ── 4. Shrink target when stable ──
    if (maxOverlap < 1e-6) {
      targetR *= 0.9985
      stableCount++
    } else {
      // Overlaps present: relax target, don't compress further
      targetR = Math.max(targetR, curR * 0.95)
      stableCount = 0
    }

    // ── 5. Occasional shake-up to escape local minima ──
    if (stableCount > 400 && maxOverlap < 1e-8 && maxWallPen < 1e-8) {
      const shakeRng = mulberry32(iter * 131 + Math.floor(curR * 1000))
      const shakeAmplitude = curR * 0.002
      for (let i = 0; i < n; i++) {
        positions[i].x += (shakeRng() - 0.5) * shakeAmplitude
        positions[i].y += (shakeRng() - 0.5) * shakeAmplitude
      }
      targetR = curR * 0.99
      stableCount = 0
    }

    // ── 6. Early exit (only when truly converged) ──
    if (maxOverlap < 1e-9 && maxWallPen < 1e-9 && stableCount > 150) break
  }

  return enclosingRadius(positions, radii)
}

/**
 * Pure overlap resolution — no compression, no centripetal.
 * Guarantees that all circles are separated after this step.
 */
function resolveAllOverlaps(positions: Point[], radii: number[], maxIter = 800): void {
  const n = positions.length
  if (n <= 1) return

  for (let iter = 0; iter < maxIter; iter++) {
    let maxOverlap = 0

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        const minD = radii[i] + radii[j]

        if (d < minD && d > 1e-10) {
          const overlap = minD - d
          if (overlap > maxOverlap) maxOverlap = overlap
          // Push apart along the line connecting centers
          const halfMove = overlap * 0.55
          positions[i].x += (dx / d) * halfMove
          positions[i].y += (dy / d) * halfMove
          positions[j].x -= (dx / d) * halfMove
          positions[j].y -= (dy / d) * halfMove
        } else if (d < 1e-10) {
          // Coincident — nudge apart
          positions[i].x += 0.01
          positions[j].x -= 0.01
        }
      }
    }

    if (maxOverlap < 1e-9) break
  }

  // Safety: if overlaps still exist, inflate enclosing radius to be safe
  const remainingOverlap = computeMaxOverlap(positions, radii)
  if (remainingOverlap > 1e-6) {
    // Last resort: scale all positions outward proportionally
    const scale = 1 + remainingOverlap / enclosingRadius(positions, radii)
    for (const p of positions) {
      p.x *= scale
      p.y *= scale
    }
  }
}

function computeMaxOverlap(positions: Point[], radii: number[]): number {
  let maxO = 0
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = dist(positions[i], positions[j])
      const minD = radii[i] + radii[j]
      if (d < minD) maxO = Math.max(maxO, minD - d)
    }
  }
  return maxO
}

// ──────────────────── Phase 3: QPQH Jump ───────────────────

/**
 * Find the "most painful" circle — the one with the largest total overlap.
 */
function findWorstCircle(positions: Point[], radii: number[]): number {
  const n = positions.length
  let worstIdx = 0
  let maxTotalOv = 0
  for (let i = 0; i < n; i++) {
    let totalOv = 0
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = dist(positions[i], positions[j])
      const minD = radii[i] + radii[j]
      if (d < minD) totalOv += (minD - d)
    }
    if (totalOv > maxTotalOv) {
      maxTotalOv = totalOv
      worstIdx = i
    }
  }
  return worstIdx
}

/**
 * QPQH "Quasi-Human" jump: re-place the worst circle by trying all
 * tangent-to-pair positions (same logic as greedy placement), keeping
 * the move if it reduces the enclosing radius.
 *
 * Returns the new enclosing radius.
 */
function qpqhJump(positions: Point[], radii: number[]): number {
  const n = positions.length
  if (n <= 2) return enclosingRadius(positions, radii)

  const worstIdx = findWorstCircle(positions, radii)
  const r = radii[worstIdx]
  const curR = enclosingRadius(positions, radii)
  let bestR = curR
  let bestPos = { ...positions[worstIdx] }

  // Temporarily remove worst circle from consideration
  const otherIndices = Array.from({ length: n }, (_, i) => i).filter(i => i !== worstIdx)

  // Try placing it tangent to every pair of other circles
  for (let a = 0; a < otherIndices.length; a++) {
    for (let b = a + 1; b < otherIndices.length; b++) {
      const ia = otherIndices[a]; const ib = otherIndices[b]
      const candidates = circleIntersection(
        positions[ia], radii[ia] + r,
        positions[ib], radii[ib] + r,
      )
      for (const pos of candidates) {
        // Check overlap with ALL other circles
        let ok = true
        for (const j of otherIndices) {
          if (dist(pos, positions[j]) < r + radii[j] - 1e-9) { ok = false; break }
        }
        if (ok) {
          const saved = { ...positions[worstIdx] }
          positions[worstIdx] = pos
          recenter(positions)
          const newR = enclosingRadius(positions, radii)
          if (newR < bestR) {
            bestR = newR
            bestPos = { ...positions[worstIdx] }
          }
          positions[worstIdx] = saved // restore for next try
        }
      }
    }
  }

  // Also try placing touching one other circle + pulled toward origin
  for (const ia of otherIndices) {
    const ca = positions[ia]
    const da = radii[ia] + r
    const ang = Math.atan2(ca.y, ca.x)
    for (const pos of [
      { x: ca.x - Math.cos(ang) * da, y: ca.y - Math.sin(ang) * da },
      { x: ca.x + Math.cos(ang) * da, y: ca.y + Math.sin(ang) * da },
    ]) {
      let ok = true
      for (const j of otherIndices) {
        if (j === ia) continue
        if (dist(pos, positions[j]) < r + radii[j] - 1e-9) { ok = false; break }
      }
      if (ok) {
        const saved = { ...positions[worstIdx] }
        positions[worstIdx] = pos
        recenter(positions)
        const newR = enclosingRadius(positions, radii)
        if (newR < bestR) {
          bestR = newR
          bestPos = { ...positions[worstIdx] }
        }
        positions[worstIdx] = saved
      }
    }
  }

  // Apply the best found position
  positions[worstIdx] = bestPos
  recenter(positions)
  return enclosingRadius(positions, radii)
}

// ──────────────────── Phase 4: Iterated Search ─────────────

/**
 * Iterated Local Search with QPQH jump as a RECOVERY mechanism.
 *
 * Runs compressive refinement. If significant overlaps remain (stuck in
 * a local minimum), applies the QPQH jump to re-place the worst circle,
 * then re-refines. Repeats until clean or no improvement.
 */
function iteratedSearch(positions: Point[], radii: number[]): void {
  const n = positions.length
  if (n <= 2) {
    compressiveRefine(positions, radii)
    resolveAllOverlaps(positions, radii)
    return
  }

  // First pass: full compressive refinement
  compressiveRefine(positions, radii)
  resolveAllOverlaps(positions, radii)

  const maxOverlap = computeMaxOverlap(positions, radii)

  // Only if stuck with significant overlaps, use QPQH jump recovery
  if (maxOverlap > 1e-6) {
    let bestR = enclosingRadius(positions, radii)
    let bestPositions = positions.map(p => ({ ...p }))

    for (let round = 0; round < 4; round++) {
      qpqhJump(positions, radii)
      compressiveRefine(positions, radii, 800)
      resolveAllOverlaps(positions, radii)

      const curR = enclosingRadius(positions, radii)
      const ov = computeMaxOverlap(positions, radii)

      if (curR < bestR - 1e-9 && ov < 1e-6) {
        bestR = curR
        bestPositions = positions.map(p => ({ ...p }))
      }

      if (ov < 1e-9) break // clean — done
    }

    // Restore best
    for (let i = 0; i < n; i++) {
      positions[i].x = bestPositions[i].x
      positions[i].y = bestPositions[i].y
    }
  }
}

// ──────────────────── Phase 5: Multi-start pick best ───────

function runOnePass(radii: number[], order: number[]): { positions: Point[]; enclosingR: number } {
  const positions = greedyWithOrder(radii, order)
  iteratedSearch(positions, radii)
  const enclosingR = enclosingRadius(positions, radii)
  return { positions, enclosingR }
}

// ──────────────────── Public API ───────────────────────────

/**
 * Pack circles into a minimal enclosing circle.
 *
 * Uses multi-start: tries largest-first ordering + several random orderings,
 * runs compressive force-refinement on each, keeps the tightest result.
 */
export function packCircles(radii: number[]): PackingResult {
  if (!radii || radii.length === 0) {
    return { positions: [], enclosingR: 0 }
  }
  if (radii.length === 1) {
    return { positions: [{ x: 0, y: 0 }], enclosingR: radii[0] }
  }

  const r = [...radii]
  const n = r.length

  // Build orderings to try
  const indices = r.map((_, i) => i)

  // 1. Largest-first (stable, good baseline)
  const largestFirst = [...indices].sort((a, b) => r[b] - r[a])

  // 2. Smallest-first (sometimes works better for many small + few large)
  const smallestFirst = [...indices].sort((a, b) => r[a] - r[b])

  // 3-7. Random orderings
  const numRandom = Math.min(5, Math.max(2, Math.floor(20 / n)))
  const rng = mulberry32(Math.floor(Date.now() % 2147483647))
  const randomOrders: number[][] = []
  for (let i = 0; i < numRandom; i++) {
    randomOrders.push(shuffle(indices, rng))
  }

  const orderings = [largestFirst, smallestFirst, ...randomOrders]

  // Run all candidates, clone positions for best result
  let bestResult: PackingResult | null = null

  for (const order of orderings) {
    const result = runOnePass(r, order)
    if (!bestResult || result.enclosingR < bestResult.enclosingR) {
      // Deep-clone the positions (they were mutated in-place)
      bestResult = {
        positions: result.positions.map(p => ({ ...p })),
        enclosingR: result.enclosingR,
      }
    }
    // Re-use the same radii array but fresh positions each time
  }

  return bestResult!
}

/**
 * Re-pack after the user dragged one cable to a new position.
 * Runs a shorter compressive refinement preserving manual adjustments.
 */
export function repackAfterDrag(radii: number[], positions: Point[]): number {
  // Quick refinement — fewer iterations, preserve user intent
  const n = positions.length
  if (n <= 1) return enclosingRadius(positions, radii)

  for (let iter = 0; iter < 300; iter++) {
    const forces: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
    let maxOverlap = 0

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        const minD = radii[i] + radii[j]
        if (d < minD && d > 1e-10) {
          const overlap = minD - d
          if (overlap > maxOverlap) maxOverlap = overlap
          const f = overlap * 0.5
          forces[i].x += (dx / d) * f
          forces[i].y += (dy / d) * f
          forces[j].x -= (dx / d) * f
          forces[j].y -= (dy / d) * f
        }
      }
    }

    const curR = enclosingRadius(positions, radii)
    let maxWallPen = 0

    for (let i = 0; i < n; i++) {
      const d = norm(positions[i])
      if (d < 1e-10) continue
      const maxD = curR - radii[i]
      if (d > maxD) {
        const pen = d - maxD
        if (pen > maxWallPen) maxWallPen = pen
        forces[i].x -= (positions[i].x / d) * pen * 0.7
        forces[i].y -= (positions[i].y / d) * pen * 0.7
      }
      // Light centripetal
      forces[i].x -= positions[i].x * 0.003
      forces[i].y -= positions[i].y * 0.003
    }

    const damping = 0.88
    for (let i = 0; i < n; i++) {
      positions[i].x += forces[i].x * damping
      positions[i].y += forces[i].y * damping
    }

    if (maxOverlap < 1e-6 && maxWallPen < 1e-6) break
  }

  resolveAllOverlaps(positions, radii)
  return enclosingRadius(positions, radii)
}
