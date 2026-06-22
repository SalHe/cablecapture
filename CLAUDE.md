# Cable Capture — 线缆包裹半径计算工具

Vue 3 + TypeScript + Vite 单页应用。工程上需将多条线缆用胶皮包裹，本工具计算最小包裹圆直径并可视化排布。

## 技术栈

- Vue 3 (Composition API + `<script setup>`)
- TypeScript
- Vite 6 (base: `/cablecapture/`)
- pnpm
- Canvas 2D（可视化）
- GitHub Actions 部署到 GitHub Pages (`gh-pages` 分支)

## 项目结构

```
src/
├── App.vue                     # 根布局，响应式三栏/双栏/单栏
├── main.ts                     # 入口
├── style.css                   # 全局暗色主题
├── components/
│   ├── CableInput.vue          # 线缆输入：直径×数量，快捷批量，±按钮，清空
│   ├── PackingCanvas.vue       # Canvas 可视化：悬停 tooltip、拖拽交互
│   └── ResultPanel.vue         # 计算结果展示
├── composables/
│   └── useCablePack.ts         # 核心状态：线缆 CRUD、打包计算、拖拽、保存/加载
└── utils/
    └── circlePacking.ts        # 圆形打包求解器（唯一算法实现）
```

## 核心算法 (`circlePacking.ts`)

**问题**：给定 N 个不等径圆，求最小包裹圆半径（NP-hard）。

**流程**：
1. **Ring 放置**（检测 ≥3 个等径最大圆时触发）→ 环排，贪心补小圆
2. **多起点贪心**（大优先、小优先、N 次随机排序）→ 择优初始布局
3. **力迭代压缩**（主力，~1500 轮）：
   - 排斥力 ∝ overlap（线性弹簧，小交叠也有感）
   - 向心力 ∝ 0.015 + d×0.02
   - 壁力 ∝ 超出目标半径的量
   - 渐进收缩 targetR（×0.9985/轮）+ shake-up 跳出局部最优
4. **QPQH 跳跃**（仅当压缩后有显著交叠时触发）：找最痛苦圆 → 贪心重放置
5. **交叠安全网**：纯排斥清理 → 等比放大兜底（保证零交叠输出）

**关键常数**（勿随意改）：
- 收缩率 0.9985、阻尼 0.7-0.85、向心基数 0.015、壁力基数 0.6
- 交叠收敛阈值 1e-9、shake-up 触发 stableCount>400

**API**：
- `packCircles(radii)` → `{ positions, enclosingR }`  — 完整求解
- `repackAfterDrag(radii, positions)` → 新 `enclosingR` — 拖拽后轻量重算

## 数据流

```
useCablePack()                     ← 所有状态在此
  ├─ cables: Cable[]                ← { id, diameter }
  ├─ packing: PackingResult         ← { positions, enclosingR }
  ├─ cableGroups (computed)         ← 按直径分组视图
  ├─ recalculate()                  ← watch cables (debounce 250ms) 触发
  ├─ fullRecalculate()              ← "重新计算" 按钮
  ├─ onDragEnd(idx, pos)            ← 拖拽松手 → repackAfterDrag
  ├─ saveSnapshot / loadSnapshot    ← localStorage 持久化
  └─ 线缆 CRUD: addCables, removeOneFromGroup, clearAll …
```

**输入模式**：直径 × 数量（如 `20*3` 添加 3 根 Ø20mm），支持快捷批量 `20*3, 12*2, 8`。

## 命令

```bash
pnpm dev          # 开发服务器
pnpm build        # 生产构建（vue-tsc + vite build）
pnpm preview      # 预览生产构建
```

## 部署

Push 到 `master` → GitHub Actions 自动构建并部署到 `gh-pages` 分支。
GitHub Pages 需手动设置 Source 为 `gh-pages` 分支（仅首次）。
