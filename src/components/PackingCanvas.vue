<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import type { Point, PackingResult } from '@/utils/circlePacking'

// ────────────────────────── Props ──────────────────────────

const props = defineProps<{
  packing: PackingResult
  radii: number[]
  cableCount: number
}>()

const emit = defineEmits<{
  dragEnd: [index: number, position: Point]
}>()

// ────────────────────────── Colors ─────────────────────────

const CABLE_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
  '#4db6ac', '#7986cb', '#90a4ae', '#ff8a65', '#82b1ff',
  '#b2ff59', '#ff80ab', '#84ffff', '#ffd740', '#7c4dff',
]

function cableColor(index: number): string {
  return CABLE_COLORS[index % CABLE_COLORS.length]
}

// ────────────────────────── Canvas refs ────────────────────

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const tooltipRef = ref<HTMLDivElement | null>(null)

const canvasSize = ref({ width: 400, height: 400 })
const hoveredIdx = ref(-1)
const draggedIdx = ref(-1)
const tooltip = ref({ visible: false, x: 0, y: 0, diameter: 0 })

// ── Local positions during drag (deep copy of packing.positions) ──
const dragPositions = ref<Point[]>([])

// ──────────────────── Coordinate mapping ──────────────────

/** The maximum model-space distance that must fit within the canvas. */
const modelMaxR = computed(() => {
  const er = props.packing.enclosingR
  return er > 0 ? er : 50
})

/** Scale: pixels per model-unit. Adds 15% padding. */
function calcScale(canvasW: number, canvasH: number, maxR: number): number {
  const minDim = Math.min(canvasW, canvasH)
  return (minDim / 2) / (maxR * 1.18)
}

/** Model → pixel (origin at canvas centre). */
function toScreen(p: Point, scale: number, cx: number, cy: number): { sx: number; sy: number } {
  return { sx: cx + p.x * scale, sy: cy + p.y * scale }
}

/** Pixel → model. */
function toModel(sx: number, sy: number, scale: number, cx: number, cy: number): Point {
  return { x: (sx - cx) / scale, y: (sy - cy) / scale }
}

// ──────────────────── Rendering ───────────────────────────

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const w = canvasSize.value.width
  const h = canvasSize.value.height

  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // Clear
  ctx.fillStyle = '#0f0f1a'
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const scale = calcScale(w, h, modelMaxR.value)
  const positions = draggedIdx.value >= 0 ? dragPositions.value : props.packing.positions
  const n = props.cableCount

  if (n === 0) {
    ctx.fillStyle = '#8888aa'
    ctx.font = '16px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('请添加线缆', cx, cy)
    return
  }

  // ── Draw outer enclosing circle (dashed) ──
  const er = props.packing.enclosingR
  if (er > 0) {
    const screenR = er * scale
    ctx.beginPath()
    ctx.arc(cx, cy, screenR, 0, Math.PI * 2)
    ctx.setLineDash([8, 4])
    ctx.strokeStyle = '#4fc3f766'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ── Draw cables ──
  for (let i = 0; i < n; i++) {
    const pos = positions[i]
    const r = props.radii[i]
    if (!pos || r <= 0) continue

    const { sx, sy } = toScreen(pos, scale, cx, cy)
    const screenR = Math.max(r * scale, 3)

    const isHovered = i === hoveredIdx.value
    const isDragged = i === draggedIdx.value

    // Shadow for hovered/dragged
    if (isHovered || isDragged) {
      ctx.save()
      ctx.shadowColor = isDragged ? '#4fc3f780' : '#ffffff40'
      ctx.shadowBlur = isDragged ? 16 : 8
    }

    // Fill
    ctx.beginPath()
    ctx.arc(sx, sy, screenR, 0, Math.PI * 2)
    const color = cableColor(i)
    ctx.fillStyle = isDragged
      ? color + 'cc'
      : isHovered
        ? color + 'aa'
        : color + '50'
    ctx.fill()

    if (isHovered || isDragged) {
      ctx.restore()
    }

    // Stroke (circle border)
    ctx.strokeStyle = isDragged ? '#ffffff' : color
    ctx.lineWidth = isDragged ? 2.5 : 1.5
    ctx.stroke()

    // Label: diameter text (if circle is big enough)
    if (screenR > 16) {
      const diameter = props.radii[i] * 2
      const fontSize = Math.max(10, Math.min(screenR * 0.7, 16))
      ctx.fillStyle = '#ffffff'
      ctx.font = `${fontSize}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${Math.round(diameter)}`, sx, sy)
    }
  }
}

// ──────────────────── Hit testing ─────────────────────────

function hitTest(sx: number, sy: number): number {
  const canvas = canvasRef.value
  if (!canvas) return -1

  const w = canvasSize.value.width
  const h = canvasSize.value.height
  const cx = w / 2
  const cy = h / 2
  const scale = calcScale(w, h, modelMaxR.value)
  const m = toModel(sx, sy, scale, cx, cy)

  const positions = draggedIdx.value >= 0 ? dragPositions.value : props.packing.positions

  // Check from top (last drawn) to bottom so smaller circles on top take priority
  for (let i = props.cableCount - 1; i >= 0; i--) {
    const pos = positions[i]
    if (!pos) continue
    const dx = m.x - pos.x
    const dy = m.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= props.radii[i]) {
      return i
    }
  }
  return -1
}

/** Get screen coordinates for an event on the canvas. */
function canvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvasSize.value.width / rect.width),
    y: (e.clientY - rect.top) * (canvasSize.value.height / rect.height),
  }
}

// ──────────────────── Event handlers ──────────────────────

function onPointerDown(e: PointerEvent) {
  const { x, y } = canvasCoords(e)
  const idx = hitTest(x, y)
  if (idx >= 0) {
    draggedIdx.value = idx
    // Deep copy positions for local drag state
    dragPositions.value = props.packing.positions.map(p => ({ ...p }))
    canvasRef.value!.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
}

function onPointerMove(e: PointerEvent) {
  const { x, y } = canvasCoords(e)

  if (draggedIdx.value >= 0) {
    // Update dragged circle position in model space
    const w = canvasSize.value.width
    const h = canvasSize.value.height
    const cx = w / 2
    const cy = h / 2
    const scale = calcScale(w, h, modelMaxR.value)
    const m = toModel(x, y, scale, cx, cy)
    dragPositions.value[draggedIdx.value] = m
    draw()

    // Keep tooltip on dragged circle
    tooltip.value = {
      visible: true,
      x: e.clientX,
      y: e.clientY,
      diameter: Math.round(props.radii[draggedIdx.value] * 2 * 10) / 10,
    }
  } else {
    const idx = hitTest(x, y)
    if (idx !== hoveredIdx.value) {
      hoveredIdx.value = idx
      draw()
    }
    if (idx >= 0) {
      const pos = props.packing.positions[idx]
      if (pos) {
        const sc = calcScale(canvasSize.value.width, canvasSize.value.height, modelMaxR.value)
        const { sx, sy } = toScreen(pos, sc, canvasSize.value.width / 2, canvasSize.value.height / 2)
        const canvas = canvasRef.value!
        const rect = canvas.getBoundingClientRect()
        tooltip.value = {
          visible: true,
          x: rect.left + sx * (rect.width / canvasSize.value.width),
          y: rect.top + sy * (rect.height / canvasSize.value.height),
          diameter: Math.round(props.radii[idx] * 2 * 10) / 10,
        }
      }
    } else {
      tooltip.value.visible = false
    }
  }
}

function onPointerUp(e: PointerEvent) {
  if (draggedIdx.value >= 0) {
    const finalPos = { ...dragPositions.value[draggedIdx.value] }
    const idx = draggedIdx.value
    draggedIdx.value = -1
    dragPositions.value = []
    tooltip.value.visible = false
    canvasRef.value!.releasePointerCapture(e.pointerId)
    emit('dragEnd', idx, finalPos)
    draw()
  }
}

function onPointerLeave() {
  if (draggedIdx.value < 0) {
    hoveredIdx.value = -1
    tooltip.value.visible = false
    draw()
  }
}

// ──────────────────── Resize handling ─────────────────────

let resizeObs: ResizeObserver | null = null

function handleResize() {
  const container = containerRef.value
  if (!container) return
  // Make canvas square based on container width
  const w = container.clientWidth
  const maxH = Math.min(w, window.innerHeight * 0.55)
  canvasSize.value = { width: w, height: maxH }
  nextTick(draw)
}

// ──────────────────── Lifecycle ───────────────────────────

onMounted(() => {
  handleResize()
  resizeObs = new ResizeObserver(() => handleResize())
  if (containerRef.value) resizeObs.observe(containerRef.value)

  // Re-draw when packing changes
  watch(() => [props.packing, props.radii], () => {
    if (draggedIdx.value < 0) {
      nextTick(draw)
    }
  }, { deep: true })
})

onUnmounted(() => {
  resizeObs?.disconnect()
})
</script>

<template>
  <section class="packing-canvas-wrapper" aria-label="排布预览">
    <h2 class="panel-title">排布预览</h2>

    <div ref="containerRef" class="canvas-container">
      <canvas
        ref="canvasRef"
        class="packing-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerLeave"
        @pointercancel="onPointerUp"
      />

      <!-- Tooltip -->
      <div
        v-if="tooltip.visible"
        ref="tooltipRef"
        class="cable-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <span class="tooltip-label">直径</span>
        <span class="tooltip-value">{{ tooltip.diameter }} mm</span>
      </div>

      <!-- Empty state overlay (shown as text on canvas, here for screen readers) -->
      <div v-if="cableCount === 0" class="empty-hint" aria-hidden="true"></div>
    </div>
  </section>
</template>

<style scoped>
.packing-canvas-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-title {
  font-size: clamp(1rem, 3vw, 1.25rem);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.canvas-container {
  position: relative;
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  min-height: 250px;
}

.packing-canvas {
  display: block;
  width: 100%;
  touch-action: none;
  cursor: crosshair;
}

.packing-canvas:active {
  cursor: grabbing;
}

.cable-tooltip {
  position: fixed;
  transform: translate(-50%, -130%);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: 8px;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.tooltip-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tooltip-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
</style>
