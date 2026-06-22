<script setup lang="ts">
defineProps<{
  outerDiameter: number
  cableCount: number
  minDiameter: number
  maxDiameter: number
}>()
</script>

<template>
  <section class="result-panel" aria-label="计算结果">
    <h2 class="panel-title">计算结果</h2>

    <div class="result-main">
      <div class="result-value">
        <span class="result-number">{{ outerDiameter.toFixed(1) }}</span>
        <span class="result-unit">mm</span>
      </div>
      <div class="result-label">最小包裹直径</div>
    </div>

    <div class="result-stats" v-if="cableCount > 0">
      <div class="stat-item">
        <span class="stat-value">{{ cableCount }}</span>
        <span class="stat-label">线缆数量</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ minDiameter }} mm</span>
        <span class="stat-label">最小线缆</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{{ maxDiameter }} mm</span>
        <span class="stat-label">最大线缆</span>
      </div>
    </div>

    <div v-else class="result-empty">
      添加线缆以计算结果
    </div>
  </section>
</template>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: clamp(16px, 4vw, 24px);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.panel-title {
  font-size: clamp(1rem, 3vw, 1.25rem);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.02em;
}

.result-main {
  text-align: center;
  padding: 16px 0;
}

.result-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
}

.result-number {
  font-size: clamp(2rem, 6vw, 3rem);
  font-weight: 800;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.result-unit {
  font-size: 1rem;
  color: var(--text-muted);
  font-weight: 500;
}

.result-label {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.result-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  background: var(--surface-alt);
  border-radius: 8px;
}

.stat-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.result-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
  font-size: 0.95rem;
}
</style>
