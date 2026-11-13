import { Gauge, LoaderCircle, Minus, Pencil, Plus, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { AiError, GEMINI_KEY_SECRET, listModels } from '../../ai/gemini'
import {
  applyAvailability,
  remaining,
  setDailyLimit,
  setUsedToday,
  useQuota,
  type ModelQuota,
  type ModelStatus,
} from '../../ai/quota'
import { httpRequest } from '../../platform/http'
import { getSecret } from '../../platform/secrets'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { cn } from '../kit/cn'
import { Input, ProgressBar } from '../kit/controls'

const STATUS: Record<ModelStatus, { label: string; tone: 'signal' | 'ember' | 'info' | 'muted' }> = {
  unknown: { label: 'Sin verificar', tone: 'muted' },
  available: { label: 'Disponible', tone: 'signal' },
  exhausted: { label: 'Agotado por hoy', tone: 'ember' },
  'rate-limited': { label: 'Límite por minuto, espera un momento', tone: 'ember' },
  busy: { label: 'Saturado temporalmente', tone: 'ember' },
  unavailable: { label: 'No disponible en tu cuenta', tone: 'muted' },
}

function formatChecked(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
}

function ModelRow({ model }: { model: ModelQuota }) {
  const [editing, setEditing] = useState(false)
  const left = remaining(model)
  const status = STATUS[model.status]
  const stepButton =
    'grid size-11 shrink-0 place-items-center rounded-full border border-white/[0.08] text-muted active:border-signal active:text-signal disabled:opacity-30'

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-white/[0.06] bg-void/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display font-semibold">{model.name}</p>
          <p className="text-xs text-muted">
            {model.perMinute > 0 ? `${model.perMinute} por minuto · ` : ''}
            {model.usedToday} {model.usedToday === 1 ? 'usada' : 'usadas'} hoy
          </p>
        </div>
        <Badge tone={status.tone} className="shrink-0 text-right">
          {model.status === 'exhausted' ? 'Agotado por hoy (0 restantes)' : status.label}
        </Badge>
      </div>

      {left === null ? (
        <p className="text-sm text-muted">Límite diario sin definir. Tócalo en el lápiz para fijarlo.</p>
      ) : (
        <ProgressBar
          size="lg"
          value={left}
          max={model.dailyLimit}
          text={`Restantes: ${left} / ${model.dailyLimit} hoy`}
          label={`Llamadas restantes de ${model.name}`}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Restar una llamada usada de ${model.name}`}
          disabled={model.usedToday === 0}
          onClick={() => setUsedToday(model.id, model.usedToday - 1)}
          className={stepButton}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <span className="flex-1 text-center text-xs text-muted">Ajustar llamadas usadas</span>
        <button
          type="button"
          aria-label={`Sumar una llamada usada de ${model.name}`}
          onClick={() => setUsedToday(model.id, model.usedToday + 1)}
          className={stepButton}
        >
          <Plus aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Editar contador y límite de ${model.name}`}
          aria-expanded={editing}
          onClick={() => setEditing((value) => !value)}
          className={cn(stepButton, editing && 'border-signal text-signal')}
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      </div>

      {editing && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Usadas hoy
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={model.usedToday}
              key={`used-${model.usedToday}`}
              onBlur={(event) => setUsedToday(model.id, Number(event.target.value))}
              className="text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Límite diario
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={model.dailyLimit}
              key={`limit-${model.dailyLimit}`}
              onBlur={(event) => setDailyLimit(model.id, Number(event.target.value))}
              className="text-sm"
            />
          </label>
        </div>
      )}
    </li>
  )
}

/**
 * Estado y cuota de los modelos: cuenta las llamadas que hace esta app y consulta, bajo demanda,
 * qué modelos ofrece la cuenta. No es tiempo real: Google no informa la cuota restante.
 */
export function QuotaPanel({ hasKey }: { hasKey: boolean }) {
  const quota = useQuota()
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setChecking(true)
    setError(null)
    try {
      const apiKey = await getSecret(GEMINI_KEY_SECRET)
      if (!apiKey) throw new Error('Primero guarda tu API key.')
      applyAvailability(await listModels(httpRequest, apiKey))
    } catch (failure) {
      setError(failure instanceof AiError || failure instanceof Error ? failure.message : 'No se pudo verificar.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card embedded label="Estado y Cuota de Modelos Gemini" icon={Gauge} className="mt-6 border-t border-white/[0.06] pt-5">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Cuenta las llamadas que hace esta app. Es una estimación: si usaste tu llave en otra herramienta, ajusta el
          contador. Se reinicia a medianoche del Pacífico, cuando Google renueva la cuota.
        </p>

        <ul className="flex flex-col gap-2.5">
          {quota.models.map((model) => (
            <ModelRow key={model.id} model={model} />
          ))}
        </ul>

        <Button variant="outline" disabled={!hasKey || checking} onClick={() => void refresh()}>
          {checking ? (
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <LoaderCircle aria-hidden />
            </motion.span>
          ) : (
            <RefreshCw aria-hidden />
          )}
          {checking ? 'Verificando modelos...' : 'Actualizar estado'}
        </Button>

        {!hasKey && <p className="text-sm text-ember">Primero guarda tu API key para verificar los modelos.</p>}
        {error && (
          <p role="alert" className="text-sm text-ember">
            {error}
          </p>
        )}
        <p role="status" className="text-xs text-muted">
          {quota.lastChecked ? `Última actualización: ${formatChecked(quota.lastChecked)}` : 'Aún no se ha verificado.'}
        </p>
      </div>
    </Card>
  )
}
