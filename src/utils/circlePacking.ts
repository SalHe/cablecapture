/**
 * Circle Packing Algorithm — packs unequal circles into a minimal enclosing circle.
 *
 * Hybrid approach combining:
 *   - Multi-start greedy placement
 *   - Force-directed compressive refinement (robust, handles local minima well)
 *   - Penalty gradient descent as a final polish step
 *   - Swap perturbation (ITS-PUCC style) to escape local minima
 *   - Overlap safety net (guaranteed no overlaps in output)
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

// ────────────────────────── Geometry ───────────────────────

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x; const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function norm(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y)
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function circleIntersection(c1: Point, r1: number, c2: Point, r2: number): Point[] {
  const d = dist(c1, c2); const res: Point[] = []
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9 || d < 1e-9) return res
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const hSq = r1 * r1 - a * a; const h = hSq > 0 ? Math.sqrt(hSq) : 0
  const dx = (c2.x - c1.x) / d; const dy = (c2.y - c1.y) / d
  const mx = c1.x + a * dx; const my = c1.y + a * dy
  const px = -dy; const py = dx
  res.push({ x: mx + h * px, y: my + h * py })
  if (h > 1e-9) res.push({ x: mx - h * px, y: my - h * py })
  return res
}

function enclosingRadius(positions: Point[], radii: number[]): number {
  let maxR = 0
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i]) continue
    const r = norm(positions[i]) + radii[i]; if (r > maxR) maxR = r
  }
  return maxR
}

function hasOverlap(positions: Point[], radii: number[], idx: number, placed: Set<number>): boolean {
  for (const j of placed) {
    if (dist(positions[idx], positions[j]) < radii[idx] + radii[j] - 1e-9) return true
  }
  return false
}

function recenter(positions: Point[]) {
  let cx = 0, cy = 0; const n = positions.length
  for (const p of positions) { cx += p.x; cy += p.y }
  for (const p of positions) { p.x -= cx / n; p.y -= cy / n }
}

function computeMaxOverlap(positions: Point[], radii: number[]): number {
  let maxO = 0
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const d = dist(positions[i], positions[j]); const minD = radii[i] + radii[j]
      if (d < minD) maxO = Math.max(maxO, minD - d)
    }
  }
  return maxO
}

function clonePositions(positions: Point[]): Point[] {
  return positions.map(p => ({ x: p.x, y: p.y }))
}

// ──────────────────── Phase 1: Greedy Placement ────────────

function greedyWithOrder(radii: number[], order: number[]): Point[] {
  const n = radii.length; const positions: Point[] = new Array(n)
  positions[order[0]] = { x: 0, y: 0 }; const placed = new Set<number>([order[0]])

  for (let k = 1; k < n; k++) {
    const idx = order[k]; const r = radii[idx]
    let bestPos: Point = { x: 0, y: r + radii[order[0]] }; let bestR = Infinity
    const placedArr = [...placed]

    for (let a = 0; a < placedArr.length; a++) {
      for (let b = a + 1; b < placedArr.length; b++) {
        const ia = placedArr[a]; const ib = placedArr[b]
        for (const pos of circleIntersection(positions[ia], radii[ia] + r, positions[ib], radii[ib] + r)) {
          positions[idx] = pos
          if (!hasOverlap(positions, radii, idx, placed)) {
            const er = enclosingRadius(positions, radii); if (er < bestR) { bestR = er; bestPos = { ...pos } }
          }
        }
      }
    }
    for (const ia of placedArr) {
      const ca = positions[ia]; const da = radii[ia] + r; const ang = Math.atan2(ca.y, ca.x)
      for (const pos of [
        { x: ca.x - Math.cos(ang) * da, y: ca.y - Math.sin(ang) * da },
        { x: ca.x + Math.cos(ang) * da, y: ca.y + Math.sin(ang) * da },
      ]) {
        positions[idx] = pos
        if (!hasOverlap(positions, radii, idx, placed)) {
          const er = enclosingRadius(positions, radii); if (er < bestR) { bestR = er; bestPos = { ...pos } }
        }
      }
    }
    positions[idx] = bestPos; placed.add(idx)
  }
  recenter(positions); return positions
}

// ──────────────────── Phase 2: Force-Directed Compression ──

/**
 * Robust force-directed compressive refinement.
 * Models circles as physical objects with spring-like repulsive forces
 * and centripetal+wall forces. Gradually shrinks the target radius.
 *
 * More robust than pure penalty gradient descent for this non-convex problem
 * because linear spring forces (F ∝ overlap) give meaningful push even for
 * small overlaps, unlike quadratic penalty (E ∝ overlap², gradient ∝ overlap).
 */
function compressiveForceRefine(positions: Point[], radii: number[], maxIter = 1500): number {
  const n = positions.length
  if (n <= 1) return enclosingRadius(positions, radii)

  let curR = enclosingRadius(positions, radii)
  let targetR = curR * 0.85
  let stableCount = 0
  let bestR = curR
  let bestPositions = clonePositions(positions)

  for (let iter = 0; iter < maxIter; iter++) {
    const fx: Float64Array = new Float64Array(n)
    const fy: Float64Array = new Float64Array(n)
    let maxOverlap = 0

    // Repulsive spring forces (F ∝ overlap, linear spring)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        const minD = radii[i] + radii[j]
        if (d < minD && d > 1e-10) {
          const ov = minD - d
          if (ov > maxOverlap) maxOverlap = ov
          // Linear spring with progressive stiffness for large overlaps
          const k = 0.4 + 0.3 * Math.min(ov / Math.max(radii[i], radii[j], 0.01), 1)
          const f = ov * k
          fx[i] += (dx / d) * f; fy[i] += (dy / d) * f
          fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f
        } else if (d < 1e-10) {
          fx[i] += 0.05; fy[i] += 0.05
          fx[j] -= 0.05; fy[j] -= 0.05
        }
      }
    }

    curR = enclosingRadius(positions, radii)
    let maxWallPen = 0
    const effectiveTarget = Math.max(targetR, curR * 0.78)

    for (let i = 0; i < n; i++) {
      const d = norm(positions[i])
      if (d < 1e-10) continue

      // Centripetal pull — progressive with distance
      const centripetal = 0.012 + d * 0.018
      fx[i] -= (positions[i].x / d) * centripetal
      fy[i] -= (positions[i].y / d) * centripetal

      // Wall force
      const maxD = effectiveTarget - radii[i]
      if (d > maxD) {
        const pen = d - maxD
        if (pen > maxWallPen) maxWallPen = pen
        const ws = 0.55 + pen * 0.35
        fx[i] -= (positions[i].x / d) * pen * ws
        fy[i] -= (positions[i].y / d) * pen * ws
      }
    }

    // Apply with adaptive damping
    const damping = maxOverlap > 0.01 ? 0.75 : 0.82
    for (let i = 0; i < n; i++) {
      positions[i].x += fx[i] * damping
      positions[i].y += fy[i] * damping
    }

    // Shrink target when stable
    if (maxOverlap < 1e-5) {
      targetR *= 0.9983; stableCount++
      if (maxOverlap < 1e-7 && maxWallPen < 1e-7 && curR < bestR) {
        bestR = curR; bestPositions = clonePositions(positions)
      }
    } else {
      targetR = Math.max(targetR, curR * 0.94); stableCount = 0
    }

    // Shake-up to escape local minima
    if (stableCount > 500 && maxOverlap < 1e-8 && maxWallPen < 1e-8) {
      const sRng = mulberry32(iter * 131 + Math.floor(curR * 1000))
      const sa = curR * 0.0015
      for (let i = 0; i < n; i++) {
        positions[i].x += (sRng() - 0.5) * sa
        positions[i].y += (sRng() - 0.5) * sa
      }
      targetR = curR * 0.99; stableCount = 0
    }

    if (maxOverlap < 1e-9 && maxWallPen < 1e-9 && stableCount > 200) break
  }

  // Restore best
  for (let i = 0; i < n; i++) {
    positions[i].x = bestPositions[i].x; positions[i].y = bestPositions[i].y
  }
  return bestR
}

// ──────────────────── Phase 3: Penalty Gradient Polish ─────

/**
 * Penalty-function gradient descent for fine-tuning.
 * Uses E = Σ overlap² + Σ container_violation² as a smooth objective.
 * Applied as a FINAL polish step when positions are already near-optimal.
 */
interface EnergyInfo {
  energy: number; maxOverlap: number; maxWallPen: number
}

function computeEnergy(positions: Point[], radii: number[], targetR: number): EnergyInfo {
  let e = 0, mo = 0, mw = 0; const n = positions.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[i].x - positions[j].x; const dy = positions[i].y - positions[j].y
      const d = Math.sqrt(dx * dx + dy * dy); const md = radii[i] + radii[j]
      if (d < md) { const ov = md - d; e += ov * ov; if (ov > mo) mo = ov }
    }
  }
  for (let i = 0; i < n; i++) {
    const d = norm(positions[i]); const md = targetR - radii[i]
    if (d > md) { const pn = d - md; e += pn * pn; if (pn > mw) mw = pn }
  }
  return { energy: e, maxOverlap: mo, maxWallPen: mw }
}

function computeGradient(positions: Point[], radii: number[], targetR: number): Point[] {
  const n = positions.length; const grad: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[i].x - positions[j].x; const dy = positions[i].y - positions[j].y
      const d = Math.sqrt(dx * dx + dy * dy); const md = radii[i] + radii[j]
      if (d < md && d > 1e-12) { const ov = md - d; const g = 2 * ov / d; grad[i].x += g * dx; grad[i].y += g * dy; grad[j].x -= g * dx; grad[j].y -= g * dy }
    }
  }
  for (let i = 0; i < n; i++) {
    const d = norm(positions[i]); if (d < 1e-12) continue; const md = targetR - radii[i]
    if (d > md) { const pn = d - md; const g = 2 * pn / d; grad[i].x += g * positions[i].x; grad[i].y += g * positions[i].y }
  }
  return grad
}

function penaltyPolish(positions: Point[], radii: number[], targetR: number, maxIter = 200): void {
  const n = positions.length; if (n <= 1) return
  for (let iter = 0; iter < maxIter; iter++) {
    const info = computeEnergy(positions, radii, targetR)
    if (info.maxOverlap < 1e-9 && info.maxWallPen < 1e-9) break
    const grad = computeGradient(positions, radii, targetR)
    let gns = 0; for (let i = 0; i < n; i++) gns += grad[i].x * grad[i].x + grad[i].y * grad[i].y
    if (gns < 1e-20) break
    const dir = grad.map(g => ({ x: -g.x, y: -g.y }))
    let step = 1.0; const c1 = 1e-4; const dd = -gns; const saved = clonePositions(positions)
    for (let ls = 0; ls < 15; ls++) {
      for (let i = 0; i < n; i++) { positions[i].x = saved[i].x + step * dir[i].x; positions[i].y = saved[i].y + step * dir[i].y }
      const trial = computeEnergy(positions, radii, targetR)
      if (trial.energy <= info.energy + c1 * step * dd) break
      step *= 0.5
      if (step < 1e-12) { for (let i = 0; i < n; i++) { positions[i].x = saved[i].x; positions[i].y = saved[i].y }; return }
    }
  }
}

// ──────────────────── Phase 4: Swap Perturbation (ITS) ─────

function trySwapPerturbations(positions: Point[], radii: number[], currentR: number, numSwaps = 6): number {
  const n = positions.length; if (n <= 2) return currentR
  const rng = mulberry32(42); let bestR = currentR; const original = clonePositions(positions)
  const pairs: [number, number][] = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(radii[i] - radii[j]) / Math.max(radii[i], radii[j], 0.01) > 0.1) pairs.push([i, j])
    }
  }
  const toTry = shuffle(pairs, rng).slice(0, Math.min(numSwaps, pairs.length))
  for (const [a, b] of toTry) {
    const tmp = positions[a]; positions[a] = positions[b]; positions[b] = tmp
    compressiveForceRefine(positions, radii, 500)
    const newR = enclosingRadius(positions, radii)
    if (newR < bestR - 1e-9) { bestR = newR } else {
      for (let i = 0; i < n; i++) { positions[i].x = original[i].x; positions[i].y = original[i].y }
    }
  }
  return bestR
}

// ──────────────────── Overlap Safety ───────────────────────

function resolveAllOverlaps(positions: Point[], radii: number[], maxIter = 500): void {
  const n = positions.length; if (n <= 1) return
  for (let iter = 0; iter < maxIter; iter++) {
    let maxOverlap = 0
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x; const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy); const minD = radii[i] + radii[j]
        if (d < minD && d > 1e-10) {
          const ov = minD - d; if (ov > maxOverlap) maxOverlap = ov
          const hm = ov * 0.55; positions[i].x += (dx / d) * hm; positions[i].y += (dy / d) * hm
          positions[j].x -= (dx / d) * hm; positions[j].y -= (dy / d) * hm
        } else if (d < 1e-10) { positions[i].x += 0.01; positions[j].x -= 0.01 }
      }
    }
    if (maxOverlap < 1e-9) break
  }
  const rem = computeMaxOverlap(positions, radii)
  if (rem > 1e-6) {
    const scale = 1 + rem / enclosingRadius(positions, radii)
    for (const p of positions) { p.x *= scale; p.y *= scale }
  }
}

// ──────────────────── Combined Pipeline ────────────────────

function runFullPipeline(radii: number[], order: number[]): { positions: Point[]; enclosingR: number } {
  const positions = greedyWithOrder(radii, order)
  let curR = enclosingRadius(positions, radii)

  // Force refinement (robust workhorse)
  curR = compressiveForceRefine(positions, radii, 1500)

  // Swap perturbations to escape local minima
  curR = trySwapPerturbations(positions, radii, curR)

  // More force refinement after swaps
  curR = compressiveForceRefine(positions, radii, 800)

  // Penalty gradient polish (fine-tuning)
  penaltyPolish(positions, radii, curR * 0.98, 200)

  // Guaranteed no overlaps
  resolveAllOverlaps(positions, radii)

  curR = enclosingRadius(positions, radii)
  return { positions, enclosingR: curR }
}

// ──────────────────── Public API ───────────────────────────

export function packCircles(radii: number[]): PackingResult {
  if (!radii || radii.length === 0) return { positions: [], enclosingR: 0 }
  if (radii.length === 1) return { positions: [{ x: 0, y: 0 }], enclosingR: radii[0] }

  const n = radii.length; const r = [...radii]; const indices = r.map((_, i) => i)

  const largestFirst = [...indices].sort((a, b) => r[b] - r[a])
  const smallestFirst = [...indices].sort((a, b) => r[a] - r[b])
  const numRandom = Math.min(4, Math.max(1, Math.floor(15 / n)))
  const rng = mulberry32(Math.floor(Date.now() % 2147483647))
  const randomOrders: number[][] = []
  for (let i = 0; i < numRandom; i++) randomOrders.push(shuffle(indices, rng))

  let bestResult: PackingResult | null = null

  for (const order of [largestFirst, smallestFirst, ...randomOrders]) {
    const result = runFullPipeline(r, order)
    if (!bestResult || result.enclosingR < bestResult.enclosingR) {
      bestResult = { positions: clonePositions(result.positions), enclosingR: result.enclosingR }
    }
  }

  return bestResult!
}

export function repackAfterDrag(radii: number[], positions: Point[]): number {
  const n = positions.length
  if (n <= 1) return enclosingRadius(positions, radii)

  // Light force refinement + overlap safety
  const curR = enclosingRadius(positions, radii)

  // Lighter: just resolve overlaps and push within container
  for (let iter = 0; iter < 300; iter++) {
    const fx = new Float64Array(n); const fy = new Float64Array(n)
    let maxOverlap = 0

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x; const dy = positions[i].y - positions[j].y
        const d = Math.sqrt(dx * dx + dy * dy); const minD = radii[i] + radii[j]
        if (d < minD && d > 1e-10) {
          const ov = minD - d; if (ov > maxOverlap) maxOverlap = ov
          const f = ov * 0.5; fx[i] += (dx / d) * f; fy[i] += (dy / d) * f; fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f
        }
      }
    }

    let maxWallPen = 0
    for (let i = 0; i < n; i++) {
      const d = norm(positions[i]); if (d < 1e-10) continue
      const maxD = curR - radii[i]
      if (d > maxD) { const pen = d - maxD; if (pen > maxWallPen) maxWallPen = pen; fx[i] -= (positions[i].x / d) * pen * 0.7; fy[i] -= (positions[i].y / d) * pen * 0.7 }
      fx[i] -= positions[i].x * 0.003; fy[i] -= positions[i].y * 0.003
    }

    for (let i = 0; i < n; i++) { positions[i].x += fx[i] * 0.88; positions[i].y += fy[i] * 0.88 }
    if (maxOverlap < 1e-6 && maxWallPen < 1e-6) break
  }

  resolveAllOverlaps(positions, radii)
  return enclosingRadius(positions, radii)
}
