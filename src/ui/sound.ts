// Efectos de sonido sintetizados: no dependen de archivos de audio externos.
import type { SoundId } from '../game/cosmetics'

type Note = [frequency: number, start: number, duration: number]

interface SoundPack {
  wave: OscillatorType
  volume: number
  complete: Note[]
  levelUp: Note[]
}

const PACKS: Record<Exclude<SoundId, 'off'>, SoundPack> = {
  classic: {
    wave: 'square',
    volume: 0.05,
    complete: [[880, 0, 0.08], [1320, 0.08, 0.16]],
    levelUp: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.35]],
  },
  arcade: {
    wave: 'square',
    volume: 0.045,
    complete: [[988, 0, 0.05], [1319, 0.05, 0.05], [1976, 0.1, 0.12]],
    levelUp: [[392, 0, 0.07], [523, 0.07, 0.07], [659, 0.14, 0.07], [784, 0.21, 0.07], [1047, 0.28, 0.07], [1568, 0.35, 0.3]],
  },
  crystal: {
    wave: 'sine',
    volume: 0.12,
    complete: [[1568, 0, 0.25], [2093, 0.06, 0.35]],
    levelUp: [[1047, 0, 0.3], [1319, 0.12, 0.3], [1568, 0.24, 0.3], [2093, 0.36, 0.6]],
  },
  bass: {
    wave: 'triangle',
    volume: 0.14,
    complete: [[220, 0, 0.1], [330, 0.1, 0.18]],
    levelUp: [[110, 0, 0.15], [147, 0.15, 0.15], [196, 0.3, 0.15], [262, 0.45, 0.4]],
  },
}

let context: AudioContext | null = null
let currentPack: SoundId = 'classic'

export function setSoundPack(pack: SoundId) {
  currentPack = pack
}

function play(pack: SoundId, pick: (sounds: SoundPack) => Note[]) {
  if (pack === 'off') return
  const sounds = PACKS[pack]
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    const startTime = context.currentTime

    for (const [frequency, start, duration] of pick(sounds)) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = sounds.wave
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(sounds.volume, startTime + start)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + start + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(startTime + start)
      oscillator.stop(startTime + start + duration)
    }
  } catch {
    // Sin audio disponible: la app sigue funcionando en silencio.
  }
}

export function playComplete(pack: SoundId = currentPack) {
  play(pack, (sounds) => sounds.complete)
}

export function playLevelUp(pack: SoundId = currentPack) {
  play(pack, (sounds) => sounds.levelUp)
}
