import { RotateCcw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { resetActRuns } from '../../ai/actRunner'
import { resetDailyAttempts } from '../../ai/dailyMission'
import { db } from '../../data/appDb'
import { resetProgress } from '../../data/gameStore'
import { forget as forgetGeneratorDraft } from '../GeneratorSheet'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { SettingRow, Switch } from '../kit/controls'

const ERASED = [
  'Campañas, actos y misiones',
  'Side Quests sueltas',
  'Árbol de habilidades',
  'Bitácora (fotos y notas)',
  'Misión del día',
  'XP, nivel y racha',
  'Temas, títulos y sonidos desbloqueados',
]

/** Deja el juego en cero. Pide dos toques y no toca la llave de Gemini, el perfil ni los recordatorios. */
export function ResetPanel({ headingId, onDone }: { headingId: string; onDone: () => void }) {
  const [keepBounties, setKeepBounties] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function reset() {
    setBusy(true)
    try {
      await resetProgress(db, { keepBounties })
      // También se olvida lo que vivía en memoria: borrador del generador, generaciones y el intento de hoy.
      forgetGeneratorDraft()
      resetActRuns()
      resetDailyAttempts()
      toast('Progreso restablecido', { description: 'Empiezas de cero.', duration: 3000 })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card embedded headingId={headingId} label="Restablecer progreso" icon={RotateCcw}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
          <p>
            Esto no se puede deshacer. Si quieres conservar algo, haz antes un respaldo en{' '}
            <span className="font-semibold">Ajustes › Respaldo</span>.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Se borra</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm marker:text-ember">
            {ERASED.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {!keepBounties && <li>Contratos diarios</li>}
          </ul>
        </div>

        <p className="text-sm text-muted">
          Se conservan tu llave de Gemini, los modelos, tu perfil, los recordatorios y la vibración.
        </p>

        <SettingRow label="Conservar mis contratos diarios" description="Se quedan los activos, sin su historial">
          <Switch
            label="Conservar mis contratos diarios"
            checked={keepBounties}
            onChange={(value) => {
              setKeepBounties(value)
              setConfirming(false)
            }}
          />
        </SettingRow>

        <Button
          variant={confirming ? 'danger' : 'secondary'}
          disabled={busy}
          onClick={() => (confirming ? void reset() : setConfirming(true))}
        >
          <RotateCcw aria-hidden />
          {confirming ? 'Toca otra vez para borrar todo' : 'Restablecer progreso'}
        </Button>
      </div>
    </Card>
  )
}
