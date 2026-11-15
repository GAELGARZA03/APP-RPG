// Error al preparar las preguntas o al diseñar: nada se creó y se puede reintentar.
import { RotateCcw, ShieldAlert, Zap } from 'lucide-react'
import { Button } from '../kit/Button'
import type { Step } from './draft'

export function FailedStep(props: {
  step: Extract<Step, { kind: 'failed' }>
  onRetry: () => void
  onUseFast: () => void
  onSkipQuestions: () => void
  onBack: () => void
}) {
  const { step } = props
  return (
    <>
      <div role="alert" className="flex items-start gap-3 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-sm">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ember" />
        <div>
          <p className="font-semibold text-ember">
            {step.stage === 'design' ? 'No se pudo diseñar la campaña' : 'No se pudieron preparar las preguntas'}
          </p>
          <p className="mt-0.5 text-ink/90">{step.message}</p>
          <p className="mt-1.5 text-muted">No se creó nada. Tu meta y tus respuestas siguen aquí.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={props.onRetry}>
          <RotateCcw aria-hidden />
          Reintentar
        </Button>
        {step.offerFast && (
          <Button variant="outline" onClick={props.onUseFast}>
            <Zap aria-hidden />
            Usar modelo rápido
          </Button>
        )}
        {step.stage === 'questions' && (
          <Button variant="outline" onClick={props.onSkipQuestions}>
            Continuar sin preguntas
          </Button>
        )}
        <Button onClick={props.onBack}>Volver</Button>
      </div>
    </>
  )
}
