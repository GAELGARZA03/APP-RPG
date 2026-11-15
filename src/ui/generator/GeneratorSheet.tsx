// Hoja del generador: orquesta los pasos y las llamadas a la IA. Cada paso se dibuja en su propio componente.
import { Check, KeyRound, LoaderCircle, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  AiError,
  askQuestions,
  designCampaign,
  MAX_IDEA_LENGTH,
  type Answer,
  type CallStatus,
  type Question,
} from '../../ai/gemini'
import { aiSession, type AiSession } from '../../ai/session'
import { db } from '../../data/appDb'
import { acceptCampaignPlan, getAiContext } from '../../data/gameStore'
import { gameDayOf } from '../../game/gameDay'
import { httpRequest } from '../../platform/http'
import { useBack } from '../backStack'
import { Button } from '../kit/Button'
import { Sheet, SheetTitle } from '../Sheet'
import { DesignProgress } from './DesignProgress'
import { chosen, forget, memory, toDraft, type Draft, type Step } from './draft'
import { FailedStep } from './FailedStep'
import { IdeaStep } from './IdeaStep'
import { PreviewStep } from './PreviewStep'
import { QuestionsStep } from './QuestionsStep'

export function GeneratorSheet(props: {
  onClose: () => void
  onOpenSettings: () => void
  onCreated: (campaign: { id: string; title: string }) => void
}) {
  const { onClose, onOpenSettings, onCreated } = props
  const headingId = useId()
  const [session, setSession] = useState<AiSession | null | undefined>(undefined)
  const [idea, setIdeaState] = useState(memory.idea)
  const [questions, setQuestionsState] = useState<Question[]>(memory.questions)
  const [answers, setAnswersState] = useState<Record<number, string>>(memory.answers)
  const [draft, setDraftState] = useState<Draft | null>(memory.draft)
  const [step, setStep] = useState<Step>(memory.draft ? { kind: 'preview' } : { kind: 'idea' })
  const [saving, setSaving] = useState(false)
  // Estado de la llamada en curso, en lenguaje para el jugador (reintentos, respaldo, listo).
  const [status, setStatus] = useState<CallStatus | null>(null)
  const requestNumber = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)

  const setIdea = (value: string) => setIdeaState((memory.idea = value))
  const setQuestions = (value: Question[]) => setQuestionsState((memory.questions = value))
  const setAnswers = (value: Record<number, string>) => setAnswersState((memory.answers = value))
  const setDraft = (value: Draft | null) => setDraftState((memory.draft = value))

  useEffect(() => {
    void aiSession().then(setSession)
    // Si la hoja se cierra a media generación, la respuesta que llegue después se ignora.
    return () => void (requestNumber.current += 1)
  }, [])

  useEffect(() => {
    scroller.current?.closest('dialog')?.scrollTo?.({ top: 0 })
  }, [step.kind])

  const answerList = (): Answer[] =>
    questions.map((question, index) => ({ question: question.question, answer: (answers[index] ?? '').trim() }))

  /** Solo la llamada vigente actualiza el mensaje; «¡Listo!» se limpia solo tras un instante. */
  const statusFor = (current: number) => (next: CallStatus) => {
    if (current !== requestNumber.current) return
    setStatus(next)
    if (next.stage === 'done') setTimeout(() => setStatus((shown) => (shown === next ? null : shown)), 1800)
    if (next.stage === 'failed') setStatus(null)
  }

  async function ask() {
    if (!session || !idea.trim()) return
    const current = ++requestNumber.current
    setStep({ kind: 'asking' })
    setDraft(null)
    try {
      const result = await askQuestions(httpRequest, {
        apiKey: session.apiKey,
        model: session.fastModel,
        idea: idea.trim(),
        onStatus: statusFor(current),
      })
      if (current !== requestNumber.current) return
      setQuestions(result)
      setAnswers({})
      if (result.length === 0) void design(false)
      else setStep({ kind: 'questions' })
    } catch (error) {
      if (current !== requestNumber.current) return
      setStep({
        kind: 'failed',
        stage: 'questions',
        message: error instanceof AiError ? error.message : 'No se pudieron preparar las preguntas.',
        offerFast: false,
      })
    }
  }

  /**
   * `fast`: el usuario eligió usar el modelo rápido tras un error, o está activo el modo ahorro
   * (Ajustes › Inteligencia artificial). Nunca se cambia de modelo en silencio.
   */
  async function design(chosenFast: boolean) {
    if (!session || !idea.trim()) return
    const fast = chosenFast || session.saver
    const current = ++requestNumber.current
    setStep({ kind: 'designing', fast })
    try {
      const context = await getAiContext(db, gameDayOf(new Date()))
      const result = await designCampaign(httpRequest, {
        apiKey: session.apiKey,
        model: fast ? session.fastModel : session.mainModel,
        thinking: fast ? undefined : 'high',
        idea: idea.trim(),
        answers: answerList(),
        context,
        // Si el modelo principal sigue saturado tras los reintentos, responde el rápido (y se avisa).
        fallbackModel: fast ? null : session.fastModel,
        onStatus: statusFor(current),
      })
      if (current !== requestNumber.current) return
      setDraft(toDraft(result))
      setStep({ kind: 'preview' })
    } catch (error) {
      if (current !== requestNumber.current) return
      const aiError = error instanceof AiError ? error : null
      setStep({
        kind: 'failed',
        stage: 'design',
        message: aiError?.message ?? 'No se pudo diseñar la campaña.',
        offerFast: !fast && Boolean(aiError?.modelRelated),
      })
    }
  }

  function cancelLoading() {
    requestNumber.current += 1
    setStatus(null)
    setStep(questions.length > 0 && step.kind === 'designing' ? { kind: 'questions' } : { kind: 'idea' })
  }

  // Botón atrás de Android: cada paso vuelve al anterior; en el primero, App cierra la hoja.
  const previous: Step | null =
    step.kind === 'idea'
      ? null
      : step.kind === 'questions' || step.kind === 'asking'
        ? { kind: 'idea' }
        : questions.length > 0
          ? { kind: 'questions' }
          : { kind: 'idea' }
  useBack(previous !== null, () => {
    requestNumber.current += 1
    if (previous) setStep(previous)
  })

  function updateDraft(update: (draft: Draft) => Draft) {
    if (draft) setDraft(update(draft))
  }

  async function accept(current: Draft) {
    if (saving) return
    setSaving(true)
    try {
      const title = current.campaign.trim()
      const { key: _key, include: _include, ...boss } = current.boss
      const campaign = await acceptCampaignPlan(db, {
        campaign: title,
        analysis: current.design.analysis,
        brief: { idea: idea.trim().slice(0, MAX_IDEA_LENGTH), answers: answerList().filter((item) => item.answer) },
        skills: current.design.skills,
        acts: current.design.acts,
        missions: chosen(current.missions),
        boss: { ...boss, title: boss.title.trim() || current.design.boss.title },
        bounties: chosen(current.bounties),
      })
      forget()
      onCreated({ id: campaign.id, title })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const toPreview = () => setStep({ kind: 'preview' })
  const backFromDesign = () => setStep(questions.length > 0 ? { kind: 'questions' } : { kind: 'idea' })

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      <div ref={scroller} className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Sparkles aria-hidden className="size-5 text-signal" />}>
          Generar campaña con IA
        </SheetTitle>

        {status?.stage === 'done' && (step.kind === 'preview' || step.kind === 'questions') && (
          <p role="status" className="-mt-2 flex items-center gap-1.5 text-sm font-medium text-signal">
            <Check aria-hidden className="size-4" strokeWidth={3} />
            {status.message}
          </p>
        )}

        {session === null && (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-line bg-raised p-3 text-sm">
              <KeyRound aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
              <p>Para generar campañas necesitas guardar tu API key de Gemini en Ajustes.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose} className="flex-1">
                Cerrar
              </Button>
              <Button variant="primary" onClick={onOpenSettings} className="flex-1">
                Ir a Ajustes
              </Button>
            </div>
          </>
        )}

        {session && step.kind === 'idea' && (
          <IdeaStep
            idea={idea}
            onIdeaChange={setIdea}
            draftTitle={draft?.campaign ?? null}
            onBackToPreview={toPreview}
            onCancel={onClose}
            onNext={() => void ask()}
          />
        )}

        {step.kind === 'asking' && (
          <>
            <div role="status" className="flex flex-col items-center gap-3 py-10 text-signal">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <LoaderCircle aria-hidden className="size-9" />
              </motion.span>
              <p className="font-display tracking-wide">Leyendo tu meta…</p>
              <p aria-live="polite" className="text-center text-sm text-muted">
                {status?.message}
              </p>
            </div>
            <Button onClick={cancelLoading}>Cancelar</Button>
          </>
        )}

        {session && step.kind === 'questions' && (
          <QuestionsStep
            questions={questions}
            answers={answers}
            onAnswersChange={setAnswers}
            hasDraft={draft !== null}
            onBackToPreview={toPreview}
            onBack={() => setStep({ kind: 'idea' })}
            onDesign={() => void design(false)}
          />
        )}

        {step.kind === 'designing' && (
          <>
            <DesignProgress fast={step.fast} status={status} />
            <Button onClick={cancelLoading}>Cancelar</Button>
          </>
        )}

        {step.kind === 'failed' && (
          <FailedStep
            step={step}
            onRetry={() => void (step.stage === 'design' ? design(false) : ask())}
            onUseFast={() => void design(true)}
            onSkipQuestions={() => void design(false)}
            onBack={() => (step.stage === 'design' ? backFromDesign() : setStep({ kind: 'idea' }))}
          />
        )}

        {step.kind === 'preview' && draft && (
          <PreviewStep
            draft={draft}
            onChange={updateDraft}
            saving={saving}
            onRedo={backFromDesign}
            onAccept={() => void accept(draft)}
          />
        )}
      </div>
    </Sheet>
  )
}
