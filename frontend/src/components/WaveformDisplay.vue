<template>
  <div class="bg-gray-900 rounded-xl p-4">
    <div class="flex justify-between items-center mb-2">
      <h3 class="text-amber-300 font-bold">实时波形</h3>
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <span v-if="store.isPlaying">播放中: {{ formatTime(store.currentPlayTime) }}</span>
        <button v-if="store.annotation" @click="store.clearAnnotation()"
          class="text-amber-400 hover:text-amber-300 text-xs">清除选择</button>
      </div>
    </div>
    
    <div class="relative">
      <canvas 
        ref="canvasRef" 
        class="w-full h-40 bg-black rounded cursor-crosshair select-none"
        @mousedown="handleMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseUp"
      />
      
      <div v-if="hoveredSegment" 
        class="absolute bg-gray-800 text-white text-xs px-2 py-1 rounded pointer-events-none z-10"
        :style="{ left: tooltipPosition.x + 'px', top: tooltipPosition.y + 'px' }">
        <div v-if="hoveredSegment.char">字符: <span class="text-amber-400 font-bold">{{ hoveredSegment.char }}</span></div>
        <div v-if="hoveredSegment.symbol">符号: <span class="text-green-400">{{ hoveredSegment.symbol }}</span></div>
        <div>类型: <span class="text-blue-400">{{ getSegmentTypeName(hoveredSegment.type) }}</span></div>
        <div>时长: <span class="text-purple-400">{{ (hoveredSegment.duration / 2).toFixed(0) }}ms</span></div>
      </div>
    </div>
    
    <div v-if="store.annotation" class="mt-3 p-3 bg-gray-800 rounded-lg border border-amber-500/30">
      <h4 class="text-amber-400 font-semibold text-sm mb-2">选中区域信息</h4>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div class="bg-gray-900 rounded p-2">
          <span class="text-gray-400">对应字符:</span>
          <span class="ml-2 text-white font-mono text-lg">{{ store.annotation.characters || '(无)' }}</span>
        </div>
        <div class="bg-gray-900 rounded p-2">
          <span class="text-gray-400">莫尔斯码:</span>
          <span class="ml-2 text-green-400 font-mono">{{ store.annotation.morseCode || '(无)' }}</span>
        </div>
        <div class="bg-gray-900 rounded p-2">
          <span class="text-gray-400">总时长:</span>
          <span class="ml-2 text-purple-400">{{ (store.annotation.duration / 2).toFixed(1) }}ms</span>
        </div>
        <div class="bg-gray-900 rounded p-2">
          <span class="text-gray-400">播放位置:</span>
          <span class="ml-2 text-blue-400">{{ formatTime(store.annotation.startTime / 2) }} - {{ formatTime(store.annotation.endTime / 2) }}</span>
        </div>
      </div>
    </div>
    
    <p class="mt-2 text-gray-500 text-xs">提示: 在波形上拖动鼠标可选中区域查看详细信息，鼠标悬停可查看单个符号信息</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { useMorseStore } from '../store/morse'
import { MORSE_TABLE } from '../utils/morse-code'
import type { WaveformSegment } from '../types'

const store = useMorseStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0
let isDragging = false
let dragStartX = 0
const hoveredSegment = ref<WaveformSegment | null>(null)
const tooltipPosition = reactive({ x: 0, y: 0 })

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const milliseconds = Math.floor(ms % 1000)
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`
}

function getSegmentTypeName(type: string): string {
  const names: Record<string, string> = {
    dot: '点',
    dash: '划',
    gap: '符号间隔',
    charGap: '字符间隔',
    wordGap: '单词间隔'
  }
  return names[type] || type
}

function getCanvasX(e: MouseEvent): number {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  return (e.clientX - rect.left) * scaleX
}

function handleMouseDown(e: MouseEvent) {
  isDragging = true
  dragStartX = getCanvasX(e)
  store.setSelection(dragStartX, null)
}

function handleMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const mouseX = getCanvasX(e)
  
  tooltipPosition.x = e.clientX - rect.left + 10
  tooltipPosition.y = e.clientY - rect.top - 60
  
  const segments = store.waveformSegments
  let found: WaveformSegment | null = null
  
  for (const seg of segments) {
    if (mouseX >= seg.x && mouseX <= seg.x + seg.width) {
      found = seg
      break
    }
  }
  
  hoveredSegment.value = found
  
  if (isDragging) {
    store.setSelection(dragStartX, mouseX)
  }
}

function handleMouseUp() {
  isDragging = false
}

onMounted(() => {
  const canvas = canvasRef.value!
  const ctx = canvas.getContext('2d')!
  let w = canvas.width = canvas.offsetWidth * 2
  let h = canvas.height = canvas.offsetHeight * 2

  function handleResize() {
    w = canvas.width = canvas.offsetWidth * 2
    h = canvas.height = canvas.offsetHeight * 2
  }
  window.addEventListener('resize', handleResize)

  function buildSegments(morse: string, dd: number): WaveformSegment[] {
    const segments: WaveformSegment[] = []
    let x = 20
    
    const tokens = morse.split(' ')
    const morseToCharMap: Record<string, string> = {}
    for (const [char, code] of Object.entries(MORSE_TABLE)) {
      morseToCharMap[code] = char
    }
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token === '/') {
        const wordGapWidth = dd * 8
        segments.push({
          type: 'wordGap',
          x: x,
          width: wordGapWidth,
          duration: wordGapWidth
        })
        x += wordGapWidth
        continue
      }
      
      const char = morseToCharMap[token] || ''
      
      for (let j = 0; j < token.length; j++) {
        const sym = token[j]
        const len = sym === '.' ? dd : dd * 3
        const symbolWidth = len * 2
        
        segments.push({
          type: sym === '.' ? 'dot' : 'dash',
          x: x,
          width: symbolWidth,
          char: char,
          symbol: sym,
          duration: symbolWidth
        })
        x += symbolWidth
        
        if (j < token.length - 1) {
          const gapWidth = dd * 2
          segments.push({
            type: 'gap',
            x: x,
            width: gapWidth,
            char: char,
            duration: gapWidth
          })
          x += gapWidth
        }
      }
      
      if (i < tokens.length - 1 && tokens[i + 1] !== '/') {
        const charGapWidth = dd * 4
        segments.push({
          type: 'charGap',
          x: x,
          width: charGapWidth,
          duration: charGapWidth
        })
        x += charGapWidth
      }
    }
    
    return segments
  }

  function draw() {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)

    const morse = store.morseOutput || 'HELLO WORLD'
    const dd = store.dotDuration

    const segments = buildSegments(morse, dd)
    store.setWaveformSegments(segments)

    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 3
    ctx.beginPath()

    for (const seg of segments) {
      if (seg.type === 'dot' || seg.type === 'dash') {
        const len = seg.width / 2
        ctx.moveTo(seg.x, h / 2)
        ctx.lineTo(seg.x + seg.width, h / 2)
        ctx.moveTo(seg.x, h / 2)
        ctx.lineTo(seg.x + len, h / 4)
        ctx.lineTo(seg.x + seg.width, h / 2)
      }
    }
    ctx.stroke()

    if (store.selectionStart !== null && store.selectionEnd !== null) {
      const selStart = Math.min(store.selectionStart, store.selectionEnd)
      const selEnd = Math.max(store.selectionStart, store.selectionEnd)
      ctx.fillStyle = 'rgba(251, 191, 36, 0.2)'
      ctx.fillRect(selStart, 0, selEnd - selStart, h)
      
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(selStart, 0)
      ctx.lineTo(selStart, h)
      ctx.moveTo(selEnd, 0)
      ctx.lineTo(selEnd, h)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (store.isPlaying) {
      const playX = 20 + store.currentPlayTime * 2
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playX, 0)
      ctx.lineTo(playX, h)
      ctx.stroke()
      
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.moveTo(playX, 0)
      ctx.lineTo(playX - 6, 10)
      ctx.lineTo(playX + 6, 10)
      ctx.closePath()
      ctx.fill()
    }

    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
    ctx.setLineDash([])

    animId = requestAnimationFrame(draw)
  }
  draw()

  onUnmounted(() => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', handleResize)
  })
})
</script>
