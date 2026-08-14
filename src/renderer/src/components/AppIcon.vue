<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

type IconEl = { tag: string; attrs: Record<string, string> }

// 统一 SVG 线性图标库（全新自绘；线条风格灵感参考 Feather Icons, MIT）
const ICONS: Record<string, IconEl[]> = {
  lock: [
    { tag: 'rect', attrs: { x: '5', y: '11', width: '14', height: '9', rx: '2' } },
    { tag: 'path', attrs: { d: 'M8 11V8a4 4 0 0 1 8 0v3' } }
  ],
  logo: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'path', attrs: { d: 'M8.5 15.5c2.4-2.9 4.6-2.9 7 0' } },
    { tag: 'path', attrs: { d: 'M8.5 12c3.4-3.9 6.6-3.9 10 0' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '1.5', fill: 'currentColor', stroke: 'none' } }
  ],
  roi: [
    { tag: 'rect', attrs: { x: '5', y: '3', width: '14', height: '18', rx: '2' } },
    { tag: 'path', attrs: { d: 'M9 3v3' } },
    { tag: 'path', attrs: { d: 'M15 3v3' } },
    { tag: 'path', attrs: { d: 'M8.5 11h7' } },
    { tag: 'path', attrs: { d: 'M8.5 14.5h4' } },
    { tag: 'path', attrs: { d: 'M8.5 18h7' } }
  ],
  dashboard: [
    { tag: 'rect', attrs: { x: '4', y: '4', width: '7', height: '7', rx: '2' } },
    { tag: 'rect', attrs: { x: '13', y: '4', width: '7', height: '7', rx: '2' } },
    { tag: 'rect', attrs: { x: '4', y: '13', width: '7', height: '7', rx: '2' } },
    { tag: 'rect', attrs: { x: '13', y: '13', width: '7', height: '7', rx: '2' } }
  ],
  product: [
    { tag: 'path', attrs: { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z' } },
    { tag: 'path', attrs: { d: 'M4 7.5l8 4.5 8-4.5' } },
    { tag: 'path', attrs: { d: 'M12 12v9' } }
  ],
  promo: [
    { tag: 'path', attrs: { d: 'M3 17l6-6 4 4 8-8' } },
    { tag: 'path', attrs: { d: 'M15 7h6v6' } }
  ],
  cs: [
    { tag: 'path', attrs: { d: 'M4 13a8 8 0 0 1 16 0' } },
    { tag: 'rect', attrs: { x: '3', y: '13', width: '4', height: '6', rx: '1.5' } },
    { tag: 'rect', attrs: { x: '17', y: '13', width: '4', height: '6', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M7 19v-3h10v3a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z' } }
  ],
  dsr: [
    { tag: 'path', attrs: { d: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z' } }
  ],
  keywords: [
    { tag: 'circle', attrs: { cx: '10.5', cy: '10.5', r: '5.5' } },
    { tag: 'path', attrs: { d: 'M14.8 14.8L20 20' } },
    { tag: 'path', attrs: { d: 'M3 6h8' } },
    { tag: 'path', attrs: { d: 'M3 10h4' } }
  ],
  store: [
    { tag: 'path', attrs: { d: 'M4 9.5L5.5 4h13L20 9.5' } },
    { tag: 'path', attrs: { d: 'M4 9.5v10h16v-10' } },
    { tag: 'path', attrs: { d: 'M9 19.5v-5h6v5' } }
  ],
  compare: [
    { tag: 'rect', attrs: { x: '3', y: '5', width: '7', height: '14', rx: '2' } },
    { tag: 'rect', attrs: { x: '14', y: '5', width: '7', height: '14', rx: '2' } },
    { tag: 'path', attrs: { d: 'M6.5 9v4' } },
    { tag: 'path', attrs: { d: 'M17.5 9v6' } }
  ],
  skills: [
    { tag: 'path', attrs: { d: 'M12 3l9 5-9 5-9-5 9-5z' } },
    { tag: 'path', attrs: { d: 'M3 13l9 5 9-5' } },
    { tag: 'path', attrs: { d: 'M3 17l9 5 9-5' } }
  ],
  settings: [
    {
      tag: 'path',
      attrs: {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'
      }
    },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } }
  ],
  minimize: [{ tag: 'path', attrs: { d: 'M5 12h14' } }],
  maximize: [{ tag: 'rect', attrs: { x: '5', y: '5', width: '14', height: '14', rx: '2' } }],
  restore: [
    { tag: 'rect', attrs: { x: '4', y: '9', width: '11', height: '11', rx: '2' } },
    { tag: 'path', attrs: { d: 'M9 4h9a2 2 0 0 1 2 2v9' } }
  ],
  close: [
    { tag: 'path', attrs: { d: 'M6 6l12 12' } },
    { tag: 'path', attrs: { d: 'M18 6L6 18' } }
  ],
  'chevron-down': [{ tag: 'path', attrs: { d: 'M6 9l6 6 6-6' } }],
  bell: [
    { tag: 'path', attrs: { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8' } },
    { tag: 'path', attrs: { d: 'M10.3 20a2 2 0 0 0 3.4 0' } }
  ],
  info: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'path', attrs: { d: 'M12 11v5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '7.8', r: '1', fill: 'currentColor', stroke: 'none' } }
  ],
  warning: [
    { tag: 'path', attrs: { d: 'M12 4L21 20H3L12 4z' } },
    { tag: 'path', attrs: { d: 'M12 10v4' } },
    { tag: 'circle', attrs: { cx: '12', cy: '16.8', r: '1', fill: 'currentColor', stroke: 'none' } }
  ],
  error: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'path', attrs: { d: 'M9 9l6 6' } },
    { tag: 'path', attrs: { d: 'M15 9l-6 6' } }
  ],
  'collapse-left': [{ tag: 'path', attrs: { d: 'M14.5 6L8.5 12l6 6' } }],
  'collapse-right': [{ tag: 'path', attrs: { d: 'M9.5 6l6 6-6 6' } }],
  check: [{ tag: 'path', attrs: { d: 'M5 12.5l4.5 4.5L19 7.5' } }],
  upload: [
    { tag: 'path', attrs: { d: 'M12 16V4' } },
    { tag: 'path', attrs: { d: 'M7 9l5-5 5 5' } },
    { tag: 'path', attrs: { d: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' } }
  ],
  download: [
    { tag: 'path', attrs: { d: 'M12 4v12' } },
    { tag: 'path', attrs: { d: 'M7 11l5 5 5-5' } },
    { tag: 'path', attrs: { d: 'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2' } }
  ],
  file: [
    { tag: 'path', attrs: { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z' } },
    { tag: 'path', attrs: { d: 'M14 3v5h5' } }
  ],
  folder: [
    { tag: 'path', attrs: { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z' } }
  ],
  trash: [
    { tag: 'path', attrs: { d: 'M4 7h16' } },
    { tag: 'path', attrs: { d: 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' } },
    { tag: 'path', attrs: { d: 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12' } },
    { tag: 'path', attrs: { d: 'M10 11v6' } },
    { tag: 'path', attrs: { d: 'M14 11v6' } }
  ],
  edit: [
    { tag: 'path', attrs: { d: 'M4 20h4L20 8l-4-4L4 16v4z' } },
    { tag: 'path', attrs: { d: 'M14 6l4 4' } }
  ],
  refresh: [
    { tag: 'path', attrs: { d: 'M20 11a8 8 0 1 0-2.3 6.3' } },
    { tag: 'path', attrs: { d: 'M20 4v7h-7' } }
  ],
  tool: [
    { tag: 'path', attrs: { d: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4L15 12l-3-3 2.7-2.7z' } }
  ],
  archive: [
    { tag: 'path', attrs: { d: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z' } },
    { tag: 'path', attrs: { d: 'M3 4h18v4H3z' } },
    { tag: 'path', attrs: { d: 'M10 12h4' } }
  ],
  trend: [
    { tag: 'path', attrs: { d: 'M3 3v18h18' } },
    { tag: 'path', attrs: { d: 'M7 14l4-5 4 3 5-7' } },
    { tag: 'circle', attrs: { cx: '7', cy: '14', r: '0.6', fill: 'currentColor', stroke: 'none' } }
  ],
  refund: [
    { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 3-6.7' } },
    { tag: 'path', attrs: { d: 'M3 4v5h5' } }
  ],
  search: [
    { tag: 'circle', attrs: { cx: '10.5', cy: '10.5', r: '6' } },
    { tag: 'path', attrs: { d: 'M15.2 15.2L20 20' } }
  ],
  action: [
    { tag: 'path', attrs: { d: 'M13 2L4 14h6l-1 8 9-12h-6l1-8z' } }
  ],
  target: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '4.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '0.8', fill: 'currentColor', stroke: 'none' } }
  ],
  ask: [
    { tag: 'path', attrs: { d: 'M21 11.5a8.4 8.4 0 0 1-8.5 8.3c-1.3 0-2.5-.3-3.6-.8L4 20l1.1-4.2a8.2 8.2 0 0 1-1.1-4.3A8.4 8.4 0 0 1 12.5 3.2 8.4 8.4 0 0 1 21 11.5z' } },
    { tag: 'path', attrs: { d: 'M9.5 10a2.5 2.5 0 0 1 4.8.8c0 1.6-2.3 2-2.3 3.2' } },
    { tag: 'circle', attrs: { cx: '12', cy: '16.6', r: '0.9', fill: 'currentColor', stroke: 'none' } }
  ],
  calendar: [
    { tag: 'rect', attrs: { x: '3', y: '5', width: '18', height: '16', rx: '2' } },
    { tag: 'path', attrs: { d: 'M8 3v4' } },
    { tag: 'path', attrs: { d: 'M16 3v4' } },
    { tag: 'path', attrs: { d: 'M3 10h18' } }
  ],
  pin: [
    { tag: 'path', attrs: { d: 'M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z' } },
    { tag: 'circle', attrs: { cx: '12', cy: '10', r: '2.5' } }
  ],
  'chevron-right': [{ tag: 'path', attrs: { d: 'M9 6l6 6-6 6' } }],  image: [
    { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '16', rx: '2' } },
    { tag: 'circle', attrs: { cx: '8.5', cy: '9.5', r: '1.6' } },
    { tag: 'path', attrs: { d: 'M4 17l4.5-4.5 3.5 3.5 4-4L20 17' } }
  ],
  'plus-square': [
    { tag: 'rect', attrs: { x: '4', y: '4', width: '16', height: '16', rx: '3' } },
    { tag: 'path', attrs: { d: 'M12 8v8' } },
    { tag: 'path', attrs: { d: 'M8 12h8' } }
  ],
  cpu: [
    { tag: 'rect', attrs: { x: '5', y: '5', width: '14', height: '14', rx: '2' } },
    { tag: 'rect', attrs: { x: '9', y: '9', width: '6', height: '6' } },
    { tag: 'path', attrs: { d: 'M9 3v2' } },
    { tag: 'path', attrs: { d: 'M15 3v2' } },
    { tag: 'path', attrs: { d: 'M9 19v2' } },
    { tag: 'path', attrs: { d: 'M15 19v2' } },
    { tag: 'path', attrs: { d: 'M3 9h2' } },
    { tag: 'path', attrs: { d: 'M3 15h2' } },
    { tag: 'path', attrs: { d: 'M19 9h2' } },
    { tag: 'path', attrs: { d: 'M19 15h2' } }
  ],
  link: [
    { tag: 'path', attrs: { d: 'M10 14a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.6 1.6' } },
    { tag: 'path', attrs: { d: 'M14 10a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.6-1.6' } }
  ],
  bolt: [
    { tag: 'path', attrs: { d: 'M13 2L4.5 13.5H11L9.5 22 19 10h-6.5L13 2z' } }
  ],
  spark: [
    { tag: 'path', attrs: { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z' } },
    { tag: 'path', attrs: { d: 'M19 16l.9 2.6L22.5 19.5l-2.6.9L19 23l-.9-2.6-2.6-.9 2.6-.9L19 16z' } }
  ],
  'chevron-up': [{ tag: 'path', attrs: { d: 'M18 15l-6-6-6 6' } }],
  chat: [
    { tag: 'path', attrs: { d: 'M21 12a8 8 0 0 1-8 8H4l2.2-2.8A8 8 0 1 1 21 12z' } },
    { tag: 'path', attrs: { d: 'M8.5 10.5h7' } },
    { tag: 'path', attrs: { d: 'M8.5 13.5h4' } }
  ],
  send: [
    { tag: 'path', attrs: { d: 'M4 4l17 8-17 8 3-8-3-8z' } },
    { tag: 'path', attrs: { d: 'M7 12h8' } }
  ],
  paperclip: [
    { tag: 'path', attrs: { d: 'M20 11.5L11.8 19.7a5 5 0 0 1-7.1-7.1L13 4.3a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.8 1.8 0 0 1-2.5-2.5l7.5-7.5' } }
  ],
  copy: [
    { tag: 'rect', attrs: { x: '9', y: '9', width: '11', height: '11', rx: '2' } },
    { tag: 'path', attrs: { d: 'M5 15V5a2 2 0 0 1 2-2h10' } }
  ],
  history: [
    { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 3-6.7L3 8' } },
    { tag: 'path', attrs: { d: 'M3 3v5h5' } },
    { tag: 'path', attrs: { d: 'M12 8v4l3 2' } }
  ],
  db: [
    { tag: 'ellipse', attrs: { cx: '12', cy: '5', rx: '8', ry: '3' } },
    { tag: 'path', attrs: { d: 'M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5' } },
    { tag: 'path', attrs: { d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' } }
  ],
  slash: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
    { tag: 'path', attrs: { d: 'M5.5 5.5l13 13' } }
  ],
  qa: [
    { tag: 'path', attrs: { d: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.2-.6L3 21l1.7-5.8A8.4 8.4 0 1 1 21 11.5z' } },
    { tag: 'path', attrs: { d: 'M12 9v.5' } },
    { tag: 'path', attrs: { d: 'M12 13.5h.01' } }
  ],
  export: [
    { tag: 'path', attrs: { d: 'M12 3v12' } },
    { tag: 'path', attrs: { d: 'M7 8l5-5 5 5' } },
    { tag: 'path', attrs: { d: 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' } }
  ],
  plus: [
    { tag: 'path', attrs: { d: 'M12 5v14' } },
    { tag: 'path', attrs: { d: 'M5 12h14' } }
  ]
}

const inner = computed(() => {
  const els = ICONS[props.name] ?? ICONS.logo
  return els
    .map((el) => {
      const attrs = Object.entries(el.attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${el.tag} ${attrs}/>`
    })
    .join('')
})
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  ></svg>
</template>