<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCablePack, type SavedSnapshot } from '@/composables/useCablePack'
import CableInput from '@/components/CableInput.vue'
import PackingCanvas from '@/components/PackingCanvas.vue'
import ResultPanel from '@/components/ResultPanel.vue'

const {
  cables,
  cableGroups,
  packing,
  outerDiameter,
  hasManuallyAdjusted,
  addCables,
  removeCableGroup,
  removeOneFromGroup,
  clearAll,
  updateCableGroup,
  onDragEnd,
  fullRecalculate,
  getSnapshots,
  saveSnapshot,
  loadSnapshot,
  deleteSnapshot,
} = useCablePack()

const minDiameter = computed(() => {
  if (cables.value.length === 0) return 0
  return Math.min(...cables.value.map(c => c.diameter))
})

const maxDiameter = computed(() => {
  if (cables.value.length === 0) return 0
  return Math.max(...cables.value.map(c => c.diameter))
})

// ── Save / Load UI state ──
const saveExpanded = ref(false)
const saveName = ref('')
const snapshots = ref<SavedSnapshot[]>(getSnapshots())

function onSave() {
  const name = saveName.value.trim()
  if (!name) return
  saveSnapshot(name)
  saveName.value = ''
  snapshots.value = getSnapshots()
}

function onLoad(name: string) {
  loadSnapshot(name)
}

function onDeleteSnapshot(name: string) {
  deleteSnapshot(name)
  snapshots.value = getSnapshots()
}

function refreshSnapshots() {
  snapshots.value = getSnapshots()
  saveExpanded.value = true
}
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
          :has-manually-adjusted="hasManuallyAdjusted"
          @add="addCables"
          @remove-group="removeCableGroup"
          @remove-one="removeOneFromGroup"
          @clear-all="clearAll"
          @update-group="updateCableGroup"
          @recalculate="fullRecalculate"
        />

        <!-- Save / Load -->
        <div class="save-section">
          <button class="save-toggle" @click="saveExpanded = !saveExpanded; refreshSnapshots()">
            <span>历史记录</span>
            <span class="save-count" v-if="snapshots.length">{{ snapshots.length }}</span>
            <span class="toggle-arrow" :class="{ expanded: saveExpanded }">▾</span>
          </button>
          <div v-if="saveExpanded" class="save-body">
            <!-- Save -->
            <div class="save-row">
              <input
                v-model="saveName"
                type="text"
                class="save-name-input"
                placeholder="输入名称保存当前状态…"
                maxlength="30"
                @keydown.enter="onSave"
              />
              <button class="btn-save" :disabled="!saveName.trim()" @click="onSave">保存</button>
            </div>
            <!-- Snapshot list -->
            <ul class="snapshot-list" v-if="snapshots.length > 0">
              <li
                v-for="snap in snapshots"
                :key="snap.name"
                class="snapshot-item"
              >
                <div class="snapshot-info">
                  <span class="snapshot-name">{{ snap.name }}</span>
                  <span class="snapshot-meta">
                    {{ snap.cables.length }} 根 · Ø{{ (snap.enclosingR * 2).toFixed(1) }}mm
                  </span>
                </div>
                <div class="snapshot-actions">
                  <button class="btn-load" @click="onLoad(snap.name)">加载</button>
                  <button class="btn-del" @click="onDeleteSnapshot(snap.name)">✕</button>
                </div>
              </li>
            </ul>
            <div v-else class="save-empty">暂无保存记录</div>
          </div>
        </div>
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

/* ── Save / Load section ── */
.panel-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.save-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.save-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  transition: background 0.15s;
}

.save-toggle:hover {
  background: var(--surface-alt);
  color: var(--text);
}

.save-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--accent-dim);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
}

.toggle-arrow {
  margin-left: auto;
  font-size: 0.75rem;
  transition: transform 0.2s;
}

.toggle-arrow.expanded {
  transform: rotate(180deg);
}

.save-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface-alt);
  border-top: 1px solid var(--border);
}

.save-row {
  display: flex;
  gap: 6px;
}

.save-name-input {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.82rem;
}

.save-name-input:focus {
  outline: none;
  border-color: var(--accent);
}

.btn-save {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.snapshot-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid transparent;
  transition: border-color 0.15s;
}

.snapshot-item:hover {
  border-color: var(--border);
}

.snapshot-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.snapshot-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snapshot-meta {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.snapshot-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-load {
  padding: 4px 10px;
  border: 1px solid var(--accent-dim);
  border-radius: 4px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  transition: all 0.15s;
}

.btn-load:hover {
  background: var(--accent);
  color: #fff;
}

.btn-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.65rem;
  transition: all 0.15s;
}

.btn-del:hover {
  background: var(--danger);
  color: #fff;
}

.save-empty {
  text-align: center;
  padding: 16px 0;
  font-size: 0.8rem;
  color: var(--text-muted);
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
