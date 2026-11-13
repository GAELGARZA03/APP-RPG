import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Flag,
  KeyRound,
  LoaderCircle,
  Lock,
  Network,
  RotateCcw,
  ShieldAlert,
  Skull,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  AiError,
  askQuestions,
  designCampaign,
  MAX_IDEA_LENGTH,
  type Answer,
  type CampaignDesign,
  type MissionPlan,
  type Question,
} from '../ai/gemini'
import { aiSession, type AiSession } from '../ai/session'
import { db } from '../data/appDb'
import { acceptCampaignPlan, getAiContext } from '../data/gameStore'
import { gameDayOf } from '../game/gameDay'
import { baseXp, questXp, type Difficulty } from '../game/rules'
import { httpRequest } from '../platform/http'
import { useBack } from './backStack'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { SectionLabel } from './kit/Card'
import { cn } from './kit/cn'
import { DifficultyPips, Field, Input, Textarea } from './kit/controls'
import { Sheet, SheetTitle } from './Sheet'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]
const IDEA_EXAMPLES = [
  'Aprender magia con cartas',
  'Correr 5 km sin parar',
  'Publicar mi app en Android',
  'Leer 12 libros este año',
]

/** Pasos que se muestran mientras el modelo principal diseña. Avanzan con el tiempo; el último espera la respuesta. */
const DESIGN_STAGES = [
  'Analizando tu meta y tus respuestas',
  'Trazando los actos del camino',
  'Diseñando las misiones del Acto 1',
  'Forjando la misión jefe',
]
const STAGE_SECONDS = 6

interface DraftItem extends MissionPlan {
  key: number
  include: boolean
}

interface Draft {
  design: CampaignDesign
  campaign: string
  missions: DraftItem[]
  boss: DraftItem
  bounties: DraftItem[]
}

type Step =
  | { kind: 'idea' }
  | { kind: 'asking' }
  | { kind: 'questions' }
  | { kind: 'designing'; fast: boolean }
  | { kind: 'failed'; stage: 'questions' | 'design'; message: string; offerFast: boolean }
  | { kind: 'preview' }

/**
 * Lo escrito y respondido sobrevive a cerrar la hoja por accidente o a un error de red.
 * Nada se guarda en la base de datos hasta aceptar la vista previa.
 */
const memory: { idea: string; questions: Question[]; answers: Record<number, string>; draft: Draft | null } = {
  idea: '',
  questions: [],
  answers: {},
  draft: null,
}

/** Olvida el borrador. Se usa al crear la campaña (y en las pruebas). */
export function forget() {
  memory.idea = ''
  memory.questions = []
  memory.answers = {}
  memory.draft = null
}

function toDraft(design: CampaignDesign): Draft {
  let key = 0
  const item = (mission: MissionPlan, include: boolean): DraftItem => ({ ...mission, key: key++, include })
  return {
    design,
    campaign: design.campaign,
    missions: design.missions.map((mission) => item(mission, true)),
    boss: item(design.boss, true),
    // Los contratos sugeridos empiezan desmarcados: si se aceptan, cuentan para la racha diaria.
    bounties: design.bounties.map((bounty) => item(bounty, false)),
  }
}

function chosen(items: DraftItem[]): MissionPlan[] {
  return items
    .filter((item) => item.include && item.title.trim())
    .map(({ key: _key, include: _include, ...mission }) => ({ ...mission, title: mission.title.trim() }))
}

const compactField =
  'min-h-11 rounded-xl border border-line bg-void px-3 text-ink outline-none transition-colors focus:border-signal'

function MissionEditor(props: {
  item: DraftItem
  boss?: boolean
  optional?: boolean
  onChange: (changes: Partial<DraftItem>) => void
}) {
  const { item, boss, optional = true, onChange } = props
  const [open, setOpen] = useState(false)

  return (
    <div
      className={cn(
        'rounded-2xl border bg-void/50 p-2.5',
        boss ? 'border-ember/40' : 'border-white/[0.06]',
        !item.include && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        {optional && (
          <input
            type="checkbox"
            checked={item.include}
            onChange={(event) => onChange({ include: event.target.checked })}
            aria-label={`Incluir ${item.title}`}
            className="mt-2.5 size-6 shrink-0 accent-signal"
          />
        )}
        {boss && (
          <span className="mt-1.5 grid size-8 shrink-0 place-items-center rounded-full bg-ember/15 text-ember">
            <Skull aria-hidden className="size-4" />
          </span>
        )}
        {/* Crece con el texto para que los títulos largos se lean completos. */}
        <textarea
          value={item.title}
          onChange={(event) => onChange({ title: event.target.value.replace(/\n/g, ' ') })}
          maxLength={80}
          rows={1}
          aria-label="Nombre de la misión"
          className={cn(compactField, 'min-w-0 flex-1 resize-none py-2 text-sm leading-snug [field-sizing:content]')}
        />
        <select
          value={item.difficulty}
          onChange={(event) => onChange({ difficulty: Number(event.target.value) as Difficulty })}
          aria-label={`Dificultad de ${item.title}`}
          className={cn(compactField, 'w-16 shrink-0 px-2 text-sm text-info')}
        >
          {DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficulty} · {boss ? questXp({ difficulty, boss }) : baseXp(difficulty)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-1 flex min-h-11 w-full items-center gap-2 px-1 text-left text-xs text-muted"
      >
        {item.estimate && (
          <span className="flex items-center gap-1">
            <Clock aria-hidden className="size-3.5" />
            {item.estimate}
          </span>
        )}
        {item.skill && (
          <span className="flex min-w-0 items-center gap-1">
            <Network aria-hidden className="size-3.5 shrink-0 text-signal" />
            <span className="truncate">{item.skill}</span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {item.steps.length} objetivos
          <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 px-1 pb-1 text-sm leading-snug">
          {item.description && <p className="text-ink/90">{item.description}</p>}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted marker:text-signal">
            {item.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {item.why && (
            <p className="text-muted">
              <span className="text-info">Por qué importa: </span>
              {item.why}
            </p>
          )}
          {item.tip && (
            <p className="text-muted">
              <span className="text-info">Consejo: </span>
              {item.tip}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DesignProgress({ fast }: { fast: boolean }) {
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setStage((value) => Math.min(value + 1, DESIGN_STAGES.length - 1)),
      (fast ? 2 : STAGE_SECONDS) * 1000,
    )
    return () => clearInterval(timer)
  }, [fast])

  return (
    <div role="status" aria-label="Diseñando tu campaña" className="flex flex-col gap-4 py-4">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-signal/15 shadow-[0_0_44px_-8px_var(--color-signal)] ring-2 ring-signal/50">
        <motion.span animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 2.4 }}>
          <Sparkles aria-hidden className="size-9 text-signal" />
        </motion.span>
      </div>
      <ol className="flex flex-col gap-2">
        {DESIGN_STAGES.map((label, index) => {
          const done = index < stage
          const active = index === stage
          return (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: done || active ? 1 : 0.4, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm"
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full',
                  done ? 'bg-signal text-on-signal' : active ? 'bg-signal/15 text-signal' : 'bg-white/[0.06] text-muted',
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                ) : active ? (
                  <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <LoaderCircle aria-hidden className="size-4" />
                  </motion.span>
                ) : (
                  <span className="font-display text-xs font-bold">{index + 1}</span>
                )}
              </span>
              <span className={cn(active && 'font-medium text-ink', !active && !done && 'text-muted')}>{label}</span>
            </motion.li>
          )
        })}
      </ol>
      <p className="text-center text-xs text-muted">
        {fast
          ? 'Diseñando con el modelo rápido…'
          : 'El modelo principal está pensando a fondo. Puede tardar hasta un minuto.'}
      </p>
    </div>
  )
}

function QuestionCard(props: {
  question: Question
  answer: string
  onAnswer: (answer: string) => void
}) {
  const { question, answer, onAnswer } = props
  const custom = answer !== '' && !question.options.includes(answer)
  const [writing, setWriting] = useState(custom)

  return (
    <fieldset className="rounded-2xl border border-white/[0.06] bg-void/50 p-3">
      <legend className="float-left mb-2.5 w-full text-[15px] leading-snug font-medium">{question.question}</legend>
      <div className="clear-both flex flex-wrap gap-2">
        {question.options.map((option) => {
          const selected = !writing && answer === option
          return (
            <motion.button
              key={option}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={selected}
              onClick={() => {
                setWriting(false)
                onAnswer(selected ? '' : option)
              }}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm transition-colors',
                selected ? 'border-signal bg-signal/15 font-medium text-signal' : 'border-white/[0.08] text-ink/90',
              )}
            >
              {option}
            </motion.button>
          )
        })}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          aria-pressed={writing}
          onClick={() => {
            setWriting((value) => !value)
            onAnswer('')
          }}
          className={cn(
            'min-h-11 rounded-full border border-dashed px-4 text-sm transition-colors',
            writing ? 'border-signal text-signal' : 'border-white/15 text-muted',
          )}
        >
          Otra…
        </motion.button>
      </div>
      {writing && (
        <Input
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          maxLength={120}
          autoFocus
          placeholder="Escribe tu respuesta"
          aria-label={`Tu respuesta a: ${question.question}`}
          className="mt-2.5 text-sm"
        />
      )}
    </fieldset>
  )
}

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

  async function ask() {
    if (!session || !idea.trim()) return
    const current = ++requestNumber.current
    setStep({ kind: 'asking' })
    setDraft(null)
    try {
      const result = await askQuestions(httpRequest, { apiKey: session.apiKey, model: session.fastModel, idea: idea.trim() })
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

  /** `fast`: el usuario eligió usar el modelo rápido tras un error; nunca se cambia en silencio. */
  async function design(fast: boolean) {
    if (!session || !idea.trim()) return
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

  const changeItem = (list: 'missions' | 'bounties', key: number) => (changes: Partial<DraftItem>) =>
    updateDraft((current) => ({
      ...current,
      [list]: current[list].map((item) => (item.key === key ? { ...item, ...changes } : item)),
    }))

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

  const answeredCount = Object.values(answers).filter((answer) => answer.trim()).length

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      <div ref={scroller} className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Sparkles aria-hidden className="size-5 text-signal" />}>
          Generar campaña con IA
        </SheetTitle>

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
          <>
            <Field
              label="Escribe tu meta o pega una conversación"
              hint={
                <span className="flex justify-between gap-2">
                  <span>
                    Tu texto y tus respuestas se envían a Google Gemini. En el nivel gratuito, Google puede usarlos para
                    mejorar sus productos.
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {idea.length}/{MAX_IDEA_LENGTH}
                  </span>
                </span>
              }
            >
              <Textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                maxLength={MAX_IDEA_LENGTH}
                rows={5}
                placeholder="Quiero aprender a tocar guitarra"
              />
            </Field>
            {idea.trim() === '' && (
              <div className="-mt-1 flex flex-wrap gap-2" aria-label="Ejemplos">
                {IDEA_EXAMPLES.map((example) => (
                  <motion.button
                    key={example}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIdea(example)}
                    className="min-h-11 rounded-full border border-white/[0.08] bg-void/50 px-3.5 text-sm text-muted active:border-signal active:text-signal"
                  >
                    {example}
                  </motion.button>
                ))}
              </div>
            )}
            {draft && (
              <Button variant="outline" onClick={() => setStep({ kind: 'preview' })}>
                Volver a la vista previa de «{draft.campaign}»
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void ask()} disabled={!idea.trim()} className="flex-1">
                Siguiente
              </Button>
            </div>
          </>
        )}

        {step.kind === 'asking' && (
          <>
            <div role="status" className="flex flex-col items-center gap-3 py-10 text-signal">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <LoaderCircle aria-hidden className="size-9" />
              </motion.span>
              <p className="font-display tracking-wide">Leyendo tu meta…</p>
            </div>
            <Button onClick={cancelLoading}>Cancelar</Button>
          </>
        )}

        {session && step.kind === 'questions' && (
          <>
            <p className="text-sm text-muted">
              Responde lo que quieras: con esto la campaña se ajusta a tu nivel y a tu tiempo. Puedes saltarte cualquiera.
            </p>
            {questions.map((question, index) => (
              <QuestionCard
                key={question.question}
                question={question}
                answer={answers[index] ?? ''}
                onAnswer={(answer) => setAnswers({ ...answers, [index]: answer })}
              />
            ))}
            {draft && (
              <Button variant="outline" onClick={() => setStep({ kind: 'preview' })}>
                Volver a la vista previa
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={() => setStep({ kind: 'idea' })} aria-label="Volver a la meta" size="icon" className="shrink-0">
                <ArrowLeft aria-hidden />
              </Button>
              <Button variant="primary" onClick={() => void design(false)} className="flex-1">
                <Sparkles aria-hidden />
                {answeredCount === 0 ? 'Saltar y diseñar' : 'Diseñar campaña'}
              </Button>
            </div>
          </>
        )}

        {step.kind === 'designing' && (
          <>
            <DesignProgress fast={step.fast} />
            <Button onClick={cancelLoading}>Cancelar</Button>
          </>
        )}

        {step.kind === 'failed' && (
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
              <Button variant="primary" onClick={() => void (step.stage === 'design' ? design(false) : ask())}>
                <RotateCcw aria-hidden />
                Reintentar
              </Button>
              {step.offerFast && (
                <Button variant="outline" onClick={() => void design(true)}>
                  <Zap aria-hidden />
                  Usar modelo rápido
                </Button>
              )}
              {step.stage === 'questions' && (
                <Button variant="outline" onClick={() => void design(false)}>
                  Continuar sin preguntas
                </Button>
              )}
              <Button onClick={() => setStep(questions.length > 0 && step.stage === 'design' ? { kind: 'questions' } : { kind: 'idea' })}>
                Volver
              </Button>
            </div>
          </>
        )}

        {step.kind === 'preview' && draft && (
          <>
            <p className="text-sm text-muted">Revisa y edita antes de aceptar. Desmarca lo que no quieras.</p>
            <Field label="Campaña">
              <Input
                value={draft.campaign}
                onChange={(event) => updateDraft((current) => ({ ...current, campaign: event.target.value }))}
                maxLength={80}
                className="font-display font-semibold"
              />
            </Field>

            <section aria-label="Análisis" className="flex flex-col gap-2.5 rounded-2xl border border-info/25 bg-info/[0.06] p-3.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel icon={Target}>Análisis</SectionLabel>
                {draft.design.analysis.duration && (
                  <Badge tone="info">
                    <Clock aria-hidden />
                    {draft.design.analysis.duration}
                  </Badge>
                )}
              </div>
              {draft.design.analysis.diagnosis && <p className="leading-relaxed text-ink/90">{draft.design.analysis.diagnosis}</p>}
              {draft.design.analysis.successCriteria && (
                <p className="leading-relaxed">
                  <span className="block text-xs font-semibold text-signal">Cómo sabrás que lo lograste</span>
                  {draft.design.analysis.successCriteria}
                </p>
              )}
              {draft.design.analysis.obstacles.length > 0 && (
                <div>
                  <span className="block text-xs font-semibold text-ember">Obstáculos probables</span>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {draft.design.analysis.obstacles.map((item) => (
                      <li key={item.obstacle} className="leading-snug">
                        {item.obstacle}
                        <span className="text-muted"> → {item.solution}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section aria-label="Actos" className="flex flex-col gap-2">
              <SectionLabel icon={Flag}>El camino · {draft.design.acts.length} actos</SectionLabel>
              <ol className="flex flex-col gap-2">
                {draft.design.acts.map((act, index) => (
                  <li key={`${index}-${act.title}`} className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3">
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-full font-display text-sm font-bold',
                        index === 0 ? 'bg-signal text-on-signal' : 'bg-white/[0.06] text-muted',
                      )}
                    >
                      {index === 0 ? index + 1 : <Lock aria-hidden className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center justify-between gap-2 font-display font-semibold">
                        <span className="min-w-0 truncate">
                          Acto {index + 1}: {act.title}
                        </span>
                        <DifficultyPips value={act.difficulty} />
                      </p>
                      <p className="mt-0.5 text-sm leading-snug text-muted">{act.goal}</p>
                      {index > 0 && (
                        <p className="mt-1 text-xs text-muted/80">
                          Sus misiones se generan al llegar, según cómo te vaya.
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-label="Misiones del Acto 1" className="flex flex-col gap-2">
              <SectionLabel>Misiones del Acto 1 · {chosen(draft.missions).length}</SectionLabel>
              {draft.missions.map((item) => (
                <MissionEditor key={item.key} item={item} onChange={changeItem('missions', item.key)} />
              ))}
            </section>

            <section aria-label="Misión jefe" className="flex flex-col gap-2">
              <SectionLabel icon={Skull}>Misión jefe · al final del Acto {draft.design.acts.length}</SectionLabel>
              <MissionEditor
                item={draft.boss}
                boss
                optional={false}
                onChange={(changes) => updateDraft((current) => ({ ...current, boss: { ...current.boss, ...changes } }))}
              />
              <p className="text-xs text-muted">Da el doble de XP y pide una foto o una nota como evidencia.</p>
            </section>

            {draft.design.skills.leaves.length > 0 && (
              <section aria-label="Habilidades" className="flex flex-col gap-2">
                <SectionLabel icon={Network}>Habilidades que crecerán</SectionLabel>
                <p className="text-sm text-muted">
                  {[draft.design.skills.area, draft.design.skills.branch].filter(Boolean).join(' › ')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {draft.design.skills.leaves.map((leaf) => (
                    <Badge key={leaf} tone="signal" className="px-2.5 py-1 text-xs">
                      {leaf}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {draft.bounties.length > 0 && (
              <section aria-label="Contratos diarios sugeridos" className="flex flex-col gap-2">
                <SectionLabel>Contratos diarios sugeridos</SectionLabel>
                {draft.bounties.map((item) => (
                  <MissionEditor key={item.key} item={item} onChange={changeItem('bounties', item.key)} />
                ))}
                <p className="text-xs text-muted">
                  Si los marcas, se suman a tus contratos de hoy y cuentan para tu racha.
                </p>
              </section>
            )}

            <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-white/[0.06] bg-panel/95 px-5 pt-3 pb-1 backdrop-blur">
              <Button onClick={() => setStep(questions.length > 0 ? { kind: 'questions' } : { kind: 'idea' })} className="flex-1 px-3">
                <RotateCcw aria-hidden />
                Rehacer
              </Button>
              <Button
                variant="primary"
                onClick={() => void accept(draft)}
                disabled={saving || !draft.campaign.trim() || chosen(draft.missions).length === 0}
                className="flex-[2]"
              >
                Crear campaña
              </Button>
            </div>
          </>
        )}

      </div>
    </Sheet>
  )
}
