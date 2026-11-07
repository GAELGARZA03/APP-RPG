import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { AiError, GEMINI_KEY_SECRET, generatePlan, MAX_IDEA_LENGTH, type GeneratedPlan } from '../ai/gemini'
import { db } from '../data/appDb'
import { acceptPlan } from '../data/gameStore'
import { getAiSettings } from '../data/settings'
import { baseXp, type Difficulty } from '../game/rules'
import { httpRequest } from '../platform/http'
import { getSecret } from '../platform/secrets'
import { Button } from './kit/Button'
import { SectionLabel } from './kit/Card'
import { cn } from './kit/cn'
import { Field, Input, Textarea } from './kit/controls'
import { Sheet, SheetTitle } from './Sheet'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]
const IDEA_EXAMPLES = [
  'Aprender magia con cartas',
  'Correr 5 km sin parar',
  'Publicar mi app en Android',
  'Leer 12 libros este año',
]

interface DraftItem {
  key: number
  title: string
  difficulty: Difficulty
  description: string
  steps: string[]
  include: boolean
}

interface Draft {
  campaign: string
  sideQuests: DraftItem[]
  bounties: DraftItem[]
}

type Step =
  | { kind: 'input'; error?: string }
  | { kind: 'loading' }
  | { kind: 'preview'; draft: Draft }

function toDraft(plan: GeneratedPlan): Draft {
  let key = 0
  const items = (list: GeneratedPlan['sideQuests'], include: boolean) =>
    list.map((item) => ({ ...item, key: key++, include }))
  // Los contratos sugeridos empiezan desmarcados: si se aceptan, cuentan para la racha diaria.
  return { campaign: plan.campaign, sideQuests: items(plan.sideQuests, true), bounties: items(plan.bounties, false) }
}

function chosen(items: DraftItem[]) {
  return items
    .filter((item) => item.include && item.title.trim())
    .map(({ title, difficulty, description, steps }) => ({ title: title.trim(), difficulty, description, steps }))
}

const compactField =
  'min-h-11 rounded-xl border border-line bg-void px-3 text-ink outline-none transition-colors focus:border-signal'

function ItemList(props: {
  label: string
  items: DraftItem[]
  onChange: (key: number, changes: Partial<DraftItem>) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2">
        <SectionLabel>{props.label}</SectionLabel>
      </legend>
      {props.items.map((item) => (
        <div key={item.key} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={item.include}
            onChange={(event) => props.onChange(item.key, { include: event.target.checked })}
            aria-label={`Incluir ${item.title}`}
            className="mt-2.5 size-6 shrink-0 accent-signal"
          />
          {/* Crece con el texto para que los títulos largos se lean completos. */}
          <textarea
            value={item.title}
            onChange={(event) => props.onChange(item.key, { title: event.target.value.replace(/\n/g, ' ') })}
            maxLength={80}
            rows={1}
            aria-label="Nombre"
            className={cn(
              compactField,
              'min-w-0 flex-1 resize-none py-2 text-sm leading-snug [field-sizing:content]',
              !item.include && 'opacity-50',
            )}
          />
          <select
            value={item.difficulty}
            onChange={(event) => props.onChange(item.key, { difficulty: Number(event.target.value) as Difficulty })}
            aria-label={`Dificultad de ${item.title}`}
            className={cn(compactField, 'w-16 shrink-0 px-2 text-sm text-info')}
          >
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {difficulty} · {baseXp(difficulty)}
              </option>
            ))}
          </select>
        </div>
      ))}
    </fieldset>
  )
}

export function GeneratorSheet(props: {
  onClose: () => void
  onOpenSettings: () => void
  onCreated: (campaign: string) => void
}) {
  const { onClose, onOpenSettings, onCreated } = props
  const headingId = useId()
  const aiSettings = useLiveQuery(() => getAiSettings(db), [])
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined)
  const [idea, setIdea] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'input' })
  const [saving, setSaving] = useState(false)
  const requestNumber = useRef(0)

  useEffect(() => {
    getSecret(GEMINI_KEY_SECRET)
      .then(setApiKey)
      .catch(() => setApiKey(null))
  }, [])

  async function generate() {
    if (!apiKey || !aiSettings || !idea.trim()) return
    const current = ++requestNumber.current
    setStep({ kind: 'loading' })
    try {
      const plan = await generatePlan(httpRequest, { apiKey, model: aiSettings.model, idea: idea.trim() })
      if (current === requestNumber.current) setStep({ kind: 'preview', draft: toDraft(plan) })
    } catch (error) {
      if (current !== requestNumber.current) return
      setStep({ kind: 'input', error: error instanceof AiError ? error.message : 'No se pudo generar.' })
    }
  }

  function cancelLoading() {
    requestNumber.current += 1
    setStep({ kind: 'input' })
  }

  function updateDraft(update: (draft: Draft) => Draft) {
    setStep((previous) => (previous.kind === 'preview' ? { kind: 'preview', draft: update(previous.draft) } : previous))
  }

  const changeItem = (list: 'sideQuests' | 'bounties') => (key: number, changes: Partial<DraftItem>) =>
    updateDraft((draft) => ({
      ...draft,
      [list]: draft[list].map((item) => (item.key === key ? { ...item, ...changes } : item)),
    }))

  async function accept(draft: Draft) {
    setSaving(true)
    try {
      const campaign = draft.campaign.trim()
      await acceptPlan(db, { campaign, sideQuests: chosen(draft.sideQuests), bounties: chosen(draft.bounties) })
      onCreated(campaign)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Sparkles aria-hidden className="size-5 text-signal" />}>
          Generar campaña con IA
        </SheetTitle>

        {apiKey === null && (
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

        {apiKey && step.kind === 'input' && (
          <>
            <Field
              label="Escribe tu idea o pega una conversación"
              hint={
                <span className="flex justify-between gap-2">
                  <span>Tu texto se envía a Google Gemini. En el nivel gratuito, Google puede usarlo para mejorar sus productos.</span>
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
                rows={6}
                placeholder="Quiero aprender magia básica con cartas"
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
                    className="rounded-full border border-white/[0.08] bg-void/50 px-3 py-1.5 text-sm text-muted active:border-signal active:text-signal"
                  >
                    {example}
                  </motion.button>
                ))}
              </div>
            )}
            {step.error && (
              <p role="alert" className="rounded-2xl border border-ember/50 bg-ember/10 p-3 text-sm text-ember">
                {step.error}
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={onClose} className="flex-1">
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void generate()}
                disabled={!idea.trim() || !aiSettings}
                className="flex-1"
              >
                <Sparkles aria-hidden />
                Generar
              </Button>
            </div>
          </>
        )}

        {step.kind === 'loading' && (
          <>
            <div role="status" className="flex flex-col items-center gap-3 py-10 text-signal">
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <LoaderCircle aria-hidden className="size-9" />
              </motion.span>
              <p className="font-display tracking-wide">Generando campaña…</p>
            </div>
            <Button onClick={cancelLoading}>Cancelar</Button>
          </>
        )}

        {step.kind === 'preview' && (
          <>
            <p className="text-sm text-muted">Revisa y edita antes de aceptar. Desmarca lo que no quieras.</p>
            <Field label="Campaña">
              <Input
                value={step.draft.campaign}
                onChange={(event) => updateDraft((draft) => ({ ...draft, campaign: event.target.value }))}
                maxLength={80}
                className="font-display font-semibold"
              />
            </Field>

            <ItemList label="Side Quests" items={step.draft.sideQuests} onChange={changeItem('sideQuests')} />

            {step.draft.bounties.length > 0 && (
              <>
                <ItemList
                  label="Contratos diarios sugeridos"
                  items={step.draft.bounties}
                  onChange={changeItem('bounties')}
                />
                <p className="-mt-2 text-xs text-muted">
                  Si los marcas, se suman a tus contratos de hoy y cuentan para tu racha.
                </p>
              </>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setStep({ kind: 'input' })} className="flex-1">
                <RotateCcw aria-hidden />
                Volver a generar
              </Button>
              <Button
                variant="primary"
                onClick={() => void accept(step.draft)}
                disabled={saving || !step.draft.campaign.trim() || chosen(step.draft.sideQuests).length === 0}
                className="flex-1"
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
