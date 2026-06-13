export interface MorseSymbol {
  char: string
  code: string
}

export type TrainMode = 'charToCode' | 'codeToChar' | 'audioToChar' | 'typingToCode'

export interface HistoryEntry {
  id: number
  input: string
  output: string
  correct: boolean
  timestamp: number
}

export interface WaveformSegment {
  type: 'dot' | 'dash' | 'gap' | 'charGap' | 'wordGap'
  x: number
  width: number
  char?: string
  symbol?: string
  duration: number
}

export interface SelectionRange {
  startX: number
  endX: number
}

export interface AnnotationInfo {
  characters: string
  morseCode: string
  duration: number
  startTime: number
  endTime: number
}
