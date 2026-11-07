// Efectos de sonido sintetizados: no dependen de archivos de audio externos.

type Note = [frequency: number, start: number, duration: number]

let context: AudioContext | null = null

function play(notes: Note[]) {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    const startTime = context.currentTime

    for (const [frequency, start, duration] of notes) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'square'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.05, startTime + start)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + start + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(startTime + start)
      oscillator.stop(startTime + start + duration)
    }
  } catch {
    // Sin audio disponible: la app sigue funcionando en silencio.
  }
}

export function playComplete() {
  play([
    [880, 0, 0.08],
    [1320, 0.08, 0.16],
  ])
}

export function playLevelUp() {
  play([
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.35],
  ])
}
