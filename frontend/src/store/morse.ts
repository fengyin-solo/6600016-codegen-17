import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { MORSE_TABLE, REVERSE_TABLE, textToMorse, morseToText } from '../utils/morse-code'
import type { TrainMode, HistoryEntry, WaveformSegment, AnnotationInfo } from '../types'

export const useMorseStore = defineStore('morse', () => {
  const inputText = ref('')
  const morseOutput = ref('')
  const decodedText = ref('')
  const wpm = ref(15)
  const frequency = ref(700)
  const volume = ref(0.6)
  const trainMode = ref<TrainMode>('charToCode')
  const history = ref<HistoryEntry[]>([])
  const quizChar = ref('')
  const userAnswer = ref('')
  const score = ref({ correct: 0, total: 0 })
  const isPlaying = ref(false)
  const currentPlayTime = ref(0)
  const waveformSegments = ref<WaveformSegment[]>([])
  const annotation = ref<AnnotationInfo | null>(null)
  const selectionStart = ref<number | null>(null)
  const selectionEnd = ref<number | null>(null)
  let audioCtx: AudioContext | null = null
  let currentOscillator: OscillatorNode | null = null
  let playStartTime = 0

  const dotDuration = computed(() => 1200 / wpm.value)

  const totalDuration = computed(() => {
    if (waveformSegments.value.length === 0) return 0
    const last = waveformSegments.value[waveformSegments.value.length - 1]
    return last.x + last.width
  })

  function getAudioCtx(): AudioContext {
    if (!audioCtx) audioCtx = new AudioContext()
    return audioCtx
  }

  function playTone(duration: number): Promise<void> {
    return new Promise(resolve => {
      const ctx = getAudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency.value
      gain.gain.value = volume.value
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      currentOscillator = osc
      setTimeout(() => { osc.stop(); currentOscillator = null; resolve() }, duration)
    })
  }

  function updatePlayPosition() {
    if (!isPlaying.value) return
    currentPlayTime.value = Date.now() - playStartTime
    requestAnimationFrame(updatePlayPosition)
  }

  async function playMorse(morse: string) {
    isPlaying.value = true
    currentPlayTime.value = 0
    playStartTime = Date.now()
    updatePlayPosition()
    const dd = dotDuration.value
    for (const token of morse.split(' ')) {
      if (token === '/') { await sleep(dd * 7); continue }
      for (const sym of token) {
        await playTone(sym === '.' ? dd : dd * 3)
        await sleep(dd)
      }
      await sleep(dd * 2)
    }
    isPlaying.value = false
    currentPlayTime.value = 0
  }

  function stopPlayback() {
    if (currentOscillator) {
      currentOscillator.stop()
      currentOscillator = null
    }
    isPlaying.value = false
    currentPlayTime.value = 0
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  function encode() {
    morseOutput.value = textToMorse(inputText.value)
  }

  function decode() {
    decodedText.value = morseToText(inputText.value)
  }

  function generateQuiz() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    quizChar.value = chars[Math.floor(Math.random() * chars.length)]
    userAnswer.value = ''
  }

  function checkAnswer() {
    const correct = userAnswer.value.trim() === MORSE_TABLE[quizChar.value]
    score.value.total++
    if (correct) score.value.correct++
    history.value.unshift({
      id: Date.now(), input: quizChar.value, output: userAnswer.value,
      correct, timestamp: Date.now()
    })
    generateQuiz()
  }

  function resetScore() {
    score.value = { correct: 0, total: 0 }
    history.value = []
  }

  function setWaveformSegments(segments: WaveformSegment[]) {
    waveformSegments.value = segments
  }

  function setSelection(start: number | null, end: number | null) {
    selectionStart.value = start
    selectionEnd.value = end
    if (start !== null && end !== null && start !== end) {
      calculateAnnotation(start, end)
    } else {
      annotation.value = null
    }
  }

  function calculateAnnotation(startX: number, endX: number) {
    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    
    const segmentsInRange = waveformSegments.value.filter(
      seg => seg.x + seg.width > minX && seg.x < maxX
    )
    
    if (segmentsInRange.length === 0) {
      annotation.value = null
      return
    }
    
    let chars = ''
    let morse = ''
    let currentChar = ''
    let currentCode = ''
    
    for (const seg of segmentsInRange) {
      if (seg.type === 'wordGap') {
        if (currentChar) {
          chars += currentChar
          morse += currentCode + ' '
          currentChar = ''
          currentCode = ''
        }
        chars += ' '
        morse += '/ '
      } else if (seg.type === 'charGap') {
        if (currentChar) {
          chars += currentChar
          morse += currentCode + ' '
          currentChar = ''
          currentCode = ''
        }
      } else if (seg.type === 'dot' || seg.type === 'dash') {
        if (seg.char && seg.char !== currentChar) {
          if (currentChar) {
            chars += currentChar
            morse += currentCode + ' '
          }
          currentChar = seg.char
          currentCode = seg.symbol || ''
        } else if (seg.symbol) {
          currentCode += seg.symbol
        }
      }
    }
    
    if (currentChar) {
      chars += currentChar
      morse += currentCode
    }
    
    const firstSeg = segmentsInRange[0]
    const lastSeg = segmentsInRange[segmentsInRange.length - 1]
    
    annotation.value = {
      characters: chars.trim(),
      morseCode: morse.trim(),
      duration: (lastSeg.x + lastSeg.width) - firstSeg.x,
      startTime: firstSeg.x,
      endTime: lastSeg.x + lastSeg.width
    }
  }

  function clearAnnotation() {
    annotation.value = null
    selectionStart.value = null
    selectionEnd.value = null
  }

  return {
    inputText, morseOutput, decodedText, wpm, frequency, volume,
    trainMode, history, quizChar, userAnswer, score, isPlaying,
    currentPlayTime, waveformSegments, annotation, selectionStart, selectionEnd,
    dotDuration, totalDuration, encode, decode, playMorse, playTone, stopPlayback,
    generateQuiz, checkAnswer, resetScore, setWaveformSegments,
    setSelection, calculateAnnotation, clearAnnotation
  }
})
