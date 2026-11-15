// Registro rápido del sueño en Hoy: se pregunta una vez al día y se puede saltar.
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Moon } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { db } from '../../data/appDb'
import { getSleep, setSleep } from '../../data/gameStore'
import { addDays, type GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { Button } from '../kit/Button'
import { formatHours, SleepStepper } from './SleepStepper'

const skipKey = (day: GameDay) => `sueño:saltado:${day}`

function skippedToday(day: GameDay): boolean {
  try {
    return localStorage.getItem(skipKey(day)) === '1'
  } catch {
    return false
  }
}

export function SleepCard({ today }: { today: GameDay }) {
  const hours = useLiveQuery(() => getSleep(db, today), [today])
  const yesterday = useLiveQuery(() => getSleep(db, addDays(today, -1)), [today])
  const [skipped, setSkipped] = useState(() => skippedToday(today))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)

  if (hours === undefined || yesterday === undefined) return null

  // Ya registrado: una línea discreta que se puede tocar para corregir.
  if (hours !== null && !editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(hours)
          setEditing(true)
        }}
        className="flex min-h-11 items-center gap-2 self-start rounded-full border border-white/[0.08] bg-raised/60 px-3.5 text-sm text-muted"
      >
        <Moon aria-hidden className="size-4 text-info" />
        Dormiste {formatHours(hours)}
      </button>
    )
  }
  if (hours === null && skipped && !editing) return null

  const value = draft ?? yesterday ?? 7.5
  async function save() {
    await setSleep(db, today, value)
    haptic('tap')
    setEditing(false)
  }
  function skip() {
    try {
      localStorage.setItem(skipKey(today), '1')
    } catch {
      // Sin almacenamiento, se volverá a preguntar al abrir la app.
    }
    setSkipped(true)
    setEditing(false)
  }

  return (
    <motion.section
      aria-label="Sueño"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-3xl border border-info/25 bg-info/[0.06] p-4"
    >
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide uppercase">
        <Moon aria-hidden className="size-4 text-info" />
        ¿Cuánto dormiste anoche?
      </h2>
      <SleepStepper value={value} onChange={setDraft} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={hours === null ? skip : () => setEditing(false)}>
          {hours === null ? 'Saltar' : 'Cancelar'}
        </Button>
        <Button size="sm" variant="primary" onClick={() => void save()}>
          <Check aria-hidden />
          Guardar
        </Button>
      </div>
    </motion.section>
  )
}
