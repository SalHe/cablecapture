import type { Point, PackingResult } from '@/utils/circlePacking'

// ── WASM module reference ──────────────────────────────────

let wasmReady = false
let wasmPackCircles: ((radii: Float64Array) => any) | null = null

// ── Initialisation ─────────────────────────────────────────

export async function initWasm(): Promise<boolean> {
  if (wasmReady) return true
  try {
    const module = await import('./cablepack.js')
    await module.default('/cablecapture/cablepack.wasm')
    wasmPackCircles = module.pack_circles
    wasmReady = true
    console.log('[cablepack] WASM solver ready')
    return true
  } catch (err) {
    console.warn('[cablepack] WASM init failed, falling back to JS solver:', err)
    return false
  }
}

// ── Public API ─────────────────────────────────────────────

export function isWasmReady(): boolean {
  return wasmReady
}

/**
 * Pack circles using the Rust/WASM solver.
 * Returns the same format as the JS solver.
 */
export function packCirclesWasm(radii: number[]): PackingResult | null {
  if (!wasmReady || !wasmPackCircles) return null

  try {
    const result = wasmPackCircles(new Float64Array(radii))
    // The Rust function returns a JsValue that deserializes to { positions, enclosing_r }
    const data = result as { positions: Point[]; enclosing_r: number }
    return {
      positions: data.positions,
      enclosingR: data.enclosing_r,
    }
  } catch (err) {
    console.warn('[cablepack] WASM call failed:', err)
    return null
  }
}
