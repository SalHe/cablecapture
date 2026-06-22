import { ref, computed, watch, shallowRef } from 'vue'
import { packCircles, repackAfterDrag } from '@/utils/circlePacking'
import type { Point, PackingResult } from '@/utils/circlePacking'
import { initWasm, packCirclesWasm } from '@/wasm/cablepackWasm'

// ────────────────────────── Types ──────────────────────────

export interface Cable {
  id: number
  diameter: number
}

// ────────────────────────── Constants ──────────────────────

const STORAGE_KEY = 'cablecapture-cables'
const SNAPSHOTS_KEY = 'cablecapture-snapshots'

export interface SavedSnapshot {
  name: string
  timestamp: number
  cables: Cable[]
  positions: Point[]
  enclosingR: number
}

function makeDefaultCables(): Cable[] {
  const cables: Cable[] = []
  let id = 1
  // 3 × 20mm, 2 × 12mm, 1 × 8mm
  const defaults: [number, number][] = [[20, 3], [12, 2], [8, 1]]
  for (const [diameter, count] of defaults) {
    for (let i = 0; i < count; i++) {
      cables.push({ id: id++, diameter })
    }
  }
  return cables
}

function loadFromStorage(): Cable[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Array.isArray(data) && data.length > 0 && data.every((c: any) => typeof c.id === 'number' && typeof c.diameter === 'number')) {
      return data as Cable[]
    }
  } catch { /* corrupted data — use defaults */ }
  return null
}

function saveToStorage(cables: Cable[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cables))
  } catch { /* storage full or unavailable */ }
}

// ────────────────────────── Composable ─────────────────────

export function useCablePack() {
  // ── State ──
  const saved = loadFromStorage()
  const defaults = saved ?? makeDefaultCables()
  const cables = ref<Cable[]>([...defaults])
  const packing = shallowRef<PackingResult>({ positions: [], enclosingR: 0 })
  const isDragging = ref(false)
  const hasManuallyAdjusted = ref(false)
  let nextId = defaults.reduce((max, c) => Math.max(max, c.id), 0) + 1

  // ── Derived ──
  const radii = computed<number[]>(() => cables.value.map(c => c.diameter / 2))

  const outerDiameter = computed<number>(() => Math.round(packing.value.enclosingR * 2 * 100) / 100)

  // ── Core engine: WASM first, JS fallback ──
  function computePacking(r: number[]): PackingResult {
    if (r.length === 0) return { positions: [], enclosingR: 0 }

    const wasmResult = packCirclesWasm(r)
    if (wasmResult) return wasmResult

    return packCircles(r)
  }

  function recalculate() {
    packing.value = computePacking(radii.value)
  }

  // Auto-recalculate + persist when cables change (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(cables, () => {
    saveToStorage(cables.value)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      recalculate()
    }, 250)
  }, { deep: true })

  // Kick off WASM loading (async, non-blocking)
  initWasm().then(() => {
    // Re-run with WASM once it's ready
    if (cables.value.length > 0) {
      packing.value = computePacking(radii.value)
    }
  })

  // Initial calculation (JS solver while WASM loads)
  recalculate()

  // ── Cable CRUD ──

  /** Add `quantity` cables of the given diameter. */
  function addCables(diameter: number, quantity: number) {
    const count = Math.max(1, Math.min(quantity, 999))
    const d = Math.max(0.1, Math.min(diameter, 9999))
    const newCables: Cable[] = []
    for (let i = 0; i < count; i++) {
      newCables.push({ id: nextId++, diameter: d })
    }
    cables.value = [...cables.value, ...newCables]
  }

  /** Remove a single cable by id. */
  function removeCable(id: number) {
    if (cables.value.length <= 1) return
    cables.value = cables.value.filter(c => c.id !== id)
  }

  /** Remove all cables matching the given IDs. */
  function removeCableGroup(ids: number[]) {
    const idSet = new Set(ids)
    const remaining = cables.value.filter(c => !idSet.has(c.id))
    if (remaining.length === 0) return // keep at least one
    cables.value = remaining
  }

  /** Remove the last cable from a group (used by "-" button). */
  function removeOneFromGroup(ids: number[]) {
    if (cables.value.length <= 1) return
    const idSet = new Set(ids)
    // Find the last cable whose id is in the set
    let found = false
    cables.value = cables.value.filter(c => {
      if (found || !idSet.has(c.id)) return true
      found = true
      return false
    })
  }

  /** Remove all cables. */
  function clearAll() {
    cables.value = []
  }

  /** Update diameter for a single cable. */
  function updateCable(id: number, diameter: number) {
    cables.value = cables.value.map(c =>
      c.id === id ? { ...c, diameter: Math.max(0.1, Math.min(diameter, 9999)) } : c
    )
  }

  /** Update diameter for all cables in a group. */
  function updateCableGroup(ids: number[], diameter: number) {
    const d = Math.max(0.1, Math.min(diameter, 9999))
    const idSet = new Set(ids)
    cables.value = cables.value.map(c =>
      idSet.has(c.id) ? { ...c, diameter: d } : c
    )
  }

  // ── Drag handling ──
  function onDragEnd(idx: number, newPos: Point) {
    if (idx < 0 || idx >= cables.value.length) return

    const r = radii.value
    const positions = packing.value.positions.map((p, i) =>
      i === idx ? { ...newPos } : { ...p }
    )

    const newEnclosingR = repackAfterDrag(r, positions)
    packing.value = { positions, enclosingR: newEnclosingR }
    hasManuallyAdjusted.value = true
  }

  /** Re-run the full greedy+refine algorithm from scratch. */
  function fullRecalculate() {
    if (debounceTimer) clearTimeout(debounceTimer)
    packing.value = computePacking(radii.value)
    hasManuallyAdjusted.value = false
  }

  // ── Save / Load snapshots ──

  function getSnapshots(): SavedSnapshot[] {
    try {
      const raw = localStorage.getItem(SNAPSHOTS_KEY)
      if (!raw) return []
      return JSON.parse(raw) as SavedSnapshot[]
    } catch { return [] }
  }

  function saveSnapshot(name: string) {
    const snapshots = getSnapshots()
    const existing = snapshots.findIndex(s => s.name === name)
    const snapshot: SavedSnapshot = {
      name,
      timestamp: Date.now(),
      cables: cables.value.map(c => ({ ...c })),
      positions: packing.value.positions.map(p => ({ ...p })),
      enclosingR: packing.value.enclosingR,
    }
    if (existing >= 0) {
      snapshots[existing] = snapshot
    } else {
      snapshots.push(snapshot)
    }
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots)) } catch { /* ignore */ }
    return snapshot
  }

  function loadSnapshot(name: string): boolean {
    const snapshots = getSnapshots()
    const snapshot = snapshots.find(s => s.name === name)
    if (!snapshot) return false

    // Cancel any previous auto-recalc
    if (debounceTimer) clearTimeout(debounceTimer)
    cables.value = snapshot.cables.map(c => ({ ...c }))
    // The watcher on cables creates a new debounce timer — cancel it too
    if (debounceTimer) clearTimeout(debounceTimer)
    nextId = cables.value.reduce((max, c) => Math.max(max, c.id), 0) + 1
    packing.value = {
      positions: snapshot.positions.map(p => ({ ...p })),
      enclosingR: snapshot.enclosingR,
    }
    hasManuallyAdjusted.value = true
    // Still save cables to auto-save storage
    saveToStorage(cables.value)
    return true
  }

  function deleteSnapshot(name: string) {
    const snapshots = getSnapshots().filter(s => s.name !== name)
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots)) } catch { /* ignore */ }
  }

  // ── Grouped view (diameter × count) ──
  interface CableGroup {
    diameter: number
    count: number
    ids: number[]
  }

  const cableGroups = computed<CableGroup[]>(() => {
    const map = new Map<number, number[]>()
    for (const c of cables.value) {
      const key = c.diameter
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c.id)
    }
    // Sort by diameter descending (largest first)
    const entries = [...map.entries()].sort((a, b) => b[0] - a[0])
    return entries.map(([diameter, ids]) => ({ diameter, count: ids.length, ids }))
  })

  return {
    cables,
    cableGroups,
    packing,
    radii,
    outerDiameter,
    isDragging,
    addCables,
    removeCable,
    removeCableGroup,
    removeOneFromGroup,
    clearAll,
    updateCable,
    updateCableGroup,
    hasManuallyAdjusted,
    onDragEnd,
    fullRecalculate,
    getSnapshots,
    saveSnapshot,
    loadSnapshot,
    deleteSnapshot,
    recalculate,
  }
}
