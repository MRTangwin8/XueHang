<script setup lang="ts">
/**
 * 成绩趋势折线图（纯 SVG，无依赖）：本人得分率 vs 平均得分率（%）。
 * <TrendChart :points="[{ label: '6/1', value: 72, avg: 65, title: '…' }]" />
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const props = defineProps<{ points: { label: string; value: number | null; avg: number | null; title: string }[] }>()

// 按容器实际宽度绘制，避免拉伸文字
const box = ref<HTMLElement>()
const W = ref(640)
const H = 220
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!box.value) return
  W.value = Math.max(280, box.value.clientWidth)
  ro = new ResizeObserver(() => box.value && (W.value = Math.max(280, box.value.clientWidth)))
  ro.observe(box.value)
})
onBeforeUnmount(() => ro?.disconnect())
const PAD = { l: 36, r: 16, t: 16, b: 34 }
const x = (i: number) => (props.points.length <= 1 ? (W.value + PAD.l - PAD.r) / 2 : PAD.l + (i * (W.value - PAD.l - PAD.r)) / (props.points.length - 1))
const y = (v: number) => PAD.t + ((100 - v) * (H - PAD.t - PAD.b)) / 100
const path = (key: 'value' | 'avg') =>
  props.points
    .map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key]!)}`))
    .filter(Boolean)
    .map((pt, i) => `${i ? 'L' : 'M'}${pt}`)
    .join(' ')
const mine = computed(() => path('value'))
const avg = computed(() => path('avg'))
const area = computed(() => {
  const pts = props.points.map((p, i) => (p.value == null ? null : [x(i), y(p.value)])).filter((v): v is number[] => !!v)
  if (pts.length < 2) return ''
  return `M${pts[0][0]},${y(0)} ` + pts.map(([a, b]) => `L${a},${b}`).join(' ') + ` L${pts[pts.length - 1][0]},${y(0)} Z`
})
</script>

<template>
  <div ref="box" class="trend">
    <svg :viewBox="`0 0 ${W} ${H}`" :width="W" :height="H" role="img" :aria-label="t('grades.student.trend')">
      <g class="grid">
        <template v-for="v in [0, 25, 50, 75, 100]" :key="v">
          <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(v)" :y2="y(v)" />
          <text :x="PAD.l - 6" :y="y(v) + 4" text-anchor="end">{{ v }}%</text>
        </template>
      </g>
      <path v-if="area" :d="area" class="area" />
      <path :d="avg" class="line avg" />
      <path :d="mine" class="line mine" />
      <g v-for="(p, i) in points" :key="i">
        <circle v-if="p.avg != null" :cx="x(i)" :cy="y(p.avg)" r="3" class="dot avg"><title>{{ p.title }}</title></circle>
        <circle v-if="p.value != null" :cx="x(i)" :cy="y(p.value)" r="4.5" class="dot mine"><title>{{ p.title }}</title></circle>
        <text :x="x(i)" :y="H - 12" text-anchor="middle" class="xl">{{ p.label }}</text>
      </g>
    </svg>
    <div class="legend">
      <span><i class="lg mine" />{{ t('grades.student.mine') }}</span>
      <span><i class="lg avg" />{{ t('grades.student.average') }}</span>
    </div>
  </div>
</template>

<style scoped>
.trend svg { display: block; }
.grid line { stroke: #eef0f5; stroke-width: 1; }
.grid text, .xl { fill: #94a3b8; font-size: 11px; }
.area { fill: var(--xh-primary); opacity: 0.08; }
.line { fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
.line.mine { stroke: var(--xh-primary); }
.line.avg { stroke: #94a3b8; stroke-dasharray: 5 4; stroke-width: 1.5; }
.dot.mine { fill: #fff; stroke: var(--xh-primary); stroke-width: 2; }
.dot.avg { fill: #94a3b8; }
.legend { display: flex; gap: 16px; justify-content: center; font-size: 12px; color: var(--xh-text-2); }
.lg { display: inline-block; width: 16px; height: 3px; margin-right: 6px; vertical-align: middle; border-radius: 2px; }
.lg.mine { background: var(--xh-primary); }
.lg.avg { background: #94a3b8; }
</style>
