<script setup lang="ts">
import { ref } from 'vue'

export interface CableGroup {
  diameter: number
  count: number
  ids: number[]
}

const CABLE_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#e57373', '#ba68c8',
  '#4db6ac', '#7986cb', '#90a4ae', '#ff8a65', '#82b1ff',
]

function cableColor(index: number): string {
  return CABLE_COLORS[index % CABLE_COLORS.length]
}

defineProps<{
  cableGroups: CableGroup[]
}>()

const emit = defineEmits<{
  add: [diameter: number, quantity: number]
  removeGroup: [ids: number[]]
  updateGroup: [ids: number[], diameter: number]
}>()

// ── Add form state ──
const addDiameter = ref(10)
const addQuantity = ref(1)

function onAdd() {
  if (addDiameter.value > 0 && addQuantity.value > 0) {
    emit('add', addDiameter.value, addQuantity.value)
    addQuantity.value = 1
  }
}

function onDiameterInput(value: string) {
  const num = parseFloat(value)
  if (!isNaN(num)) addDiameter.value = num
}

function onQuantityInput(value: string) {
  const num = parseInt(value, 10)
  if (!isNaN(num)) addQuantity.value = num
}

// ── Quick input ──
const quickInput = ref('')
const quickExpanded = ref(false)

interface ParsedEntry {
  diameter: number
  quantity: number
}

function parseQuickInput(raw: string): ParsedEntry[] {
  const entries: ParsedEntry[] = []
  // Split by half-width or full-width comma
  const segments = raw.split(/[,，]/)
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed) continue
    // Try "diameter * quantity" or "diameter × quantity" or "diameter x quantity"
    const match = trimmed.match(/^([\d.]+)\s*[*×xX]\s*(\d+)\s*$/)
    if (match) {
      const diameter = parseFloat(match[1])
      const quantity = parseInt(match[2], 10)
      if (diameter > 0 && quantity > 0) {
        entries.push({ diameter, quantity })
      }
    } else {
      // Standalone number → quantity = 1
      const diameter = parseFloat(trimmed)
      if (diameter > 0) {
        entries.push({ diameter, quantity: 1 })
      }
    }
  }
  return entries
}

function onQuickParse() {
  const entries = parseQuickInput(quickInput.value)
  for (const e of entries) {
    emit('add', e.diameter, e.quantity)
  }
  if (entries.length > 0) {
    quickInput.value = ''
  }
}

function onQuickKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    onQuickParse()
  }
}

// ── Group edit ──
function onGroupDiameterChange(ids: number[], value: string) {
  const num = parseFloat(value)
  if (!isNaN(num) && num > 0) {
    emit('updateGroup', ids, num)
  }
}

// ── Mobile collapse ──
const collapsed = ref(window.innerWidth < 768)

function toggleCollapsed() {
  if (window.innerWidth < 768) {
    collapsed.value = !collapsed.value
  }
}
</script>

<template>
  <section class="cable-input" aria-label="线缆列表">
    <button class="panel-header" @click="toggleCollapsed">
      <h2 class="panel-title">线缆列表</h2>
      <span class="collapse-arrow" :class="{ collapsed: collapsed }">▾</span>
    </button>

    <div class="panel-content" :class="{ collapsed: collapsed }">
      <!-- Quick input: "20*3, 12*2, 8" -->
      <div class="quick-input-section">
        <button class="quick-toggle" @click="quickExpanded = !quickExpanded">
          <span>快捷输入</span>
          <span class="toggle-arrow" :class="{ expanded: quickExpanded }">▾</span>
        </button>
        <div v-if="quickExpanded" class="quick-input-body">
          <input
            v-model="quickInput"
            type="text"
            class="quick-input-field"
            placeholder="例: 20*3, 12*2, 8"
            @keydown="onQuickKeydown"
          />
          <button class="btn-parse" @click="onQuickParse">解析</button>
          <p class="quick-hint">格式：<code>直径*数量</code>，逗号分隔多个。如 <code>20*3, 12*2, 8</code></p>
        </div>
      </div>

      <!-- Add form: diameter × quantity -->
      <div class="add-form">
        <div class="add-field">
          <label class="field-label">直径</label>
          <input
            type="number"
            class="field-input"
            :value="addDiameter"
            min="0.1"
            max="9999"
            step="0.5"
            inputmode="decimal"
            placeholder="直径"
            @input="onDiameterInput(($event.target as HTMLInputElement).value)"
          />
          <span class="field-unit">mm</span>
        </div>
        <span class="multiply">×</span>
        <div class="add-field">
          <label class="field-label">数量</label>
          <input
            type="number"
            class="field-input qty-input"
            :value="addQuantity"
            min="1"
            max="999"
            step="1"
            inputmode="numeric"
            placeholder="数量"
            @input="onQuantityInput(($event.target as HTMLInputElement).value)"
          />
        </div>
        <button class="btn-add" @click="onAdd">
          + 添加
        </button>
      </div>

      <!-- Grouped cable list -->
      <ul class="cable-list" v-if="cableGroups.length > 0">
        <li
          v-for="(group, idx) in cableGroups"
          :key="group.ids.join(',')"
          class="cable-row"
        >
          <span class="cable-color" :style="{ background: cableColor(idx) }"></span>
          <div class="cable-info">
            <input
              type="number"
              class="diameter-input"
              :value="group.diameter"
              min="0.1"
              max="9999"
              step="0.5"
              inputmode="decimal"
              aria-label="线缆直径"
              @input="onGroupDiameterChange(group.ids, ($event.target as HTMLInputElement).value)"
            />
            <span class="unit">mm</span>
          </div>
          <span class="multiply">×</span>
          <span class="count-badge">{{ group.count }}</span>
          <button
            class="btn-remove"
            :disabled="cableGroups.length <= 1 && group.count <= 1"
            aria-label="删除该组线缆"
            @click="emit('removeGroup', group.ids)"
          >
            ✕
          </button>
        </li>
      </ul>

      <div v-else class="empty-hint">
        请添加线缆
      </div>
    </div><!-- .panel-content -->
  </section>
</template>


<style scoped>
.cable-input {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── Panel header / toggle ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  cursor: default;
  color: inherit;
}

.panel-title {
  font-size: clamp(1rem, 3vw, 1.25rem);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.collapse-arrow {
  display: none;
  font-size: 0.85rem;
  color: var(--text-muted);
  transition: transform 0.25s;
  flex-shrink: 0;
}

.collapse-arrow.collapsed {
  transform: rotate(-90deg);
}

/* ── Collapsible content wrapper ── */
.panel-content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  transition: max-height 0.3s ease, opacity 0.25s ease;
}

.panel-content.collapsed {
  max-height: 0;
  opacity: 0;
}

/* ── Quick input ── */
.quick-input-section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.quick-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.quick-toggle:hover {
  background: var(--surface-alt);
  color: var(--text);
}

.toggle-arrow {
  font-size: 0.75rem;
  transition: transform 0.2s;
}

.toggle-arrow.expanded {
  transform: rotate(180deg);
}

.quick-input-body {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  background: var(--surface-alt);
  border-top: 1px solid var(--border);
}

.quick-input-field {
  flex: 1;
  min-width: 160px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  font-size: 0.85rem;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
}

.quick-input-field:focus {
  outline: none;
  border-color: var(--accent);
}

.quick-input-field::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}

.btn-parse {
  padding: 7px 16px;
  border: none;
  border-radius: 6px;
  background: var(--accent-dim);
  color: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.15s;
}

.btn-parse:hover {
  background: var(--accent);
}

.btn-parse:active {
  transform: scale(0.97);
}

.quick-hint {
  width: 100%;
  margin-top: 2px;
  font-size: 0.68rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.quick-hint code {
  background: var(--bg);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.72rem;
  color: var(--accent);
}

/* ── Add form ── */
.add-form {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px;
  border: 1px solid var(--border);
}

.add-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.field-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.field-input {
  width: 100%;
  padding: 7px 6px 7px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
}

.field-input:focus {
  outline: none;
  border-color: var(--accent);
}

.qty-input {
  text-align: center;
  max-width: 56px;
}

.field-unit {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.multiply {
  font-size: 1.1rem;
  color: var(--text-muted);
  font-weight: 600;
  padding-bottom: 6px;
}

.btn-add {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  background: var(--accent-dim);
  color: #fff;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  transition: background 0.15s;
  height: 34px;
}

.btn-add:hover {
  background: var(--accent);
}

.btn-add:active {
  transform: scale(0.97);
}

/* ── Cable list ── */
.cable-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 35vh;
  overflow-y: auto;
}

.cable-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface-alt);
  border-radius: var(--radius);
  padding: 8px 12px;
  border: 1px solid var(--border);
  transition: border-color 0.2s;
}

.cable-row:focus-within {
  border-color: var(--accent);
}

.cable-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.85;
}

.cable-info {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.diameter-input {
  width: 70px;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 0.875rem;
}

.diameter-input:focus {
  outline: none;
  border-color: var(--accent);
}

.unit {
  font-size: 0.7rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.count-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 26px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--bg);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.btn-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-remove:hover:not(:disabled) {
  background: var(--danger);
  color: white;
}

.btn-remove:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

@media (max-width: 767px) {
  .panel-header {
    cursor: pointer;
    padding: 10px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .panel-header:active {
    background: var(--surface-alt);
  }

  .collapse-arrow {
    display: block;
  }

  .cable-list {
    max-height: 25vh;
  }

  .btn-add {
    padding: 8px 16px;
    font-size: 0.9rem;
  }
}
</style>
