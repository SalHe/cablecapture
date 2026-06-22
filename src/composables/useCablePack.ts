import { ref, computed, watch, shallowRef } from 'vue'
import { packCircles, repackAfterDrag } from '@/utils/circlePacking'
import type { Point, PackingResult } from '@/utils/circlePacking'

// ────────────────────────── Types ──────────────────────────

export interface Cable {
  id: number
  diameter: number
}

// ────────────────────────── Constants ──────────────────────

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

// ────────────────────────── Composable ─────────────────────

export function useCablePack() {
  // ── State ──
  const defaults = makeDefaultCables()
  const cables = ref<Cable[]>([...defaults])
  const packing = shallowRef<PackingResult>({ positions: [], enclosingR: 0 })
  const isDragging = ref(false)
  let nextId = defaults.length + 1

  // ── Derived ──
  const radii = computed<number[]>(() => cables.value.map(c => c.diameter / 2))

  const outerDiameter = computed<number>(() => Math.round(packing.value.enclosingR * 2 * 100) / 100)

  // ── Recalculate packing ──
  function recalculate() {
    const r = radii.value
    if (r.length === 0) {
      packing.value = { positions: [], enclosingR: 0 }
    } else {
      packing.value = packCircles(r)
    }
  }

  // Auto-recalculate when cables change (debounced)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(cables, () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      recalculate()
    }, 250)
  }, { deep: true })

  // Initial calculation
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
    updateCable,
    updateCableGroup,
    onDragEnd,
    recalculate,
  }
}
