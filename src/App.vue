<script setup lang="ts">
import { computed } from 'vue'
import { useCablePack } from '@/composables/useCablePack'
import CableInput from '@/components/CableInput.vue'
import PackingCanvas from '@/components/PackingCanvas.vue'
import ResultPanel from '@/components/ResultPanel.vue'

const {
  cables,
  cableGroups,
  packing,
  outerDiameter,
  addCables,
  removeCableGroup,
  updateCableGroup,
  onDragEnd,
} = useCablePack()

const minDiameter = computed(() => {
  if (cables.value.length === 0) return 0
  return Math.min(...cables.value.map(c => c.diameter))
})

const maxDiameter = computed(() => {
  if (cables.value.length === 0) return 0
  return Math.max(...cables.value.map(c => c.diameter))
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">线缆包裹计算</h1>
      <p class="app-subtitle">Cable Capture · 最小外胶皮半径计算工具</p>
    </header>

    <main class="app-main">
      <div class="panel panel-input">
        <CableInput
          :cable-groups="cableGroups"
          @add="addCables"
          @remove-group="removeCableGroup"
          @update-group="updateCableGroup"
        />
      </div>

      <div class="panel panel-canvas">
        <PackingCanvas
          :packing="packing"
          :radii="cables.map(c => c.diameter / 2)"
          :cable-count="cables.length"
          @drag-end="onDragEnd"
        />
      </div>

      <div class="panel panel-result">
        <ResultPanel
          :outer-diameter="outerDiameter"
          :cable-count="cables.length"
          :min-diameter="minDiameter"
          :max-diameter="maxDiameter"
        />
      </div>
    </main>

    <footer class="app-footer">
      <span>线缆包裹计算工具</span>
      <span class="footer-sep">·</span>
      <span>拖拽线缆可手动调整排布</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: clamp(12px, 3vw, 24px);
  gap: clamp(12px, 3vw, 20px);
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

/* ── Header ── */
.app-header {
  text-align: center;
  padding: clamp(8px, 2vw, 16px) 0;
}

.app-title {
  font-size: clamp(1.4rem, 5vw, 2rem);
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.04em;
}

.app-subtitle {
  font-size: clamp(0.75rem, 2vw, 0.875rem);
  color: var(--text-muted);
  margin-top: 4px;
}

/* ── Main grid ── */
.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
  gap: clamp(12px, 3vw, 20px);
}

.panel {
  min-width: 0; /* prevent grid blowout */
}

/* ── Footer ── */
.app-footer {
  text-align: center;
  padding: clamp(8px, 2vw, 16px) 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.footer-sep {
  opacity: 0.4;
}

/* ── Desktop: two-column layout ── */
@media (min-width: 768px) {
  .app-main {
    grid-template-columns: 280px 1fr;
    grid-template-rows: auto auto;
  }

  .panel-input {
    grid-column: 1;
    grid-row: 1 / 3;
  }

  .panel-canvas {
    grid-column: 2;
    grid-row: 1;
  }

  .panel-result {
    grid-column: 2;
    grid-row: 2;
  }
}

/* ── Wide desktop: three panels in a row ── */
@media (min-width: 1100px) {
  .app-main {
    grid-template-columns: 280px 1fr 260px;
    grid-template-rows: 1fr;
  }

  .panel-input {
    grid-column: 1;
    grid-row: 1;
  }

  .panel-canvas {
    grid-column: 2;
    grid-row: 1;
  }

  .panel-result {
    grid-column: 3;
    grid-row: 1;
  }
}
</style>
