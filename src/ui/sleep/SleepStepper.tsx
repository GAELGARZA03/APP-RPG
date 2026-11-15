import { Minus, Plus } from 'lucide-react'
import { clampSleep, MAX_SLEEP_HOURS } from '../../data/gameStore'
import { Button } from '../kit/Button'

/** Horas en pasos de media hora: «7 h 30 min». */
export function formatHours(hours: number): string {
  const whole = Math.floor(hours)
  return hours % 1 === 0 ? `${whole} h` : `${whole} h 30 min`
}

/** Selector de horas dormidas, de media en media hora. */
export function SleepStepper({ value, onChange }: { value: number; onChange: (hours: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        size="icon"
        variant="secondary"
        aria-label="Media hora menos"
        disabled={value <= 0}
        onClick={() => onChange(clampSleep(value - 0.5))}
      >
        <Minus aria-hidden />
      </Button>
      <output aria-live="polite" className="min-w-28 text-center font-display text-2xl font-semibold tabular-nums">
        {formatHours(value)}
      </output>
      <Button
        size="icon"
        variant="secondary"
        aria-label="Media hora más"
        disabled={value >= MAX_SLEEP_HOURS}
        onClick={() => onChange(clampSleep(value + 0.5))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}
