import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useRef, useState } from 'react'
import { AiError, GEMINI_KEY_SECRET, generatePlan, MAX_IDEA_LENGTH, type GeneratedPlan } from '../ai/gemini'
import { db } from '../data/appDb'
import { acceptPlan } from '../data/gameStore'
import { getAiSettings } from '../data/settings'
import { baseXp, type Difficulty } from '../game/rules'
import { httpRequest } from '../platform/http'
import { getSecret } from '../platform/secrets'
import { Sheet } from './Sheet'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

interface DraftItem {
  key: number
  title: string
  difficulty: Difficulty
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
    .map(({ title, difficulty }) => ({ title: title.trim(), difficulty }))
}

const fieldClass =
  'min-h-11 rounded-md border border-line bg-void px-3 text-base text-ink outline-none focus:border-signal'
const primaryClass = 'min-h-11 flex-1 rounded-md bg-signal font-bold text-void disabled:opacity-40'
const secondaryClass = 'min-h-11 flex-1 rounded-md border border-line text-muted'

function ItemList(props: {
  label: string
  items: DraftItem[]
  onChange: (key: number, changes: Partial<DraftItem>) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs tracking-widest text-muted">{props.label.toUpperCase()}</legend>
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
            className={`${fieldClass} min-w-0 flex-1 resize-none py-2 text-sm leading-snug [field-sizing:content] ${
              item.include ? '' : 'opacity-50'
            }`}
          />
          <select
            value={item.difficulty}
            onChange={(event) => props.onChange(item.key, { difficulty: Number(event.target.value) as Difficulty })}
            aria-label={`Dificultad de ${item.title}`}
            className={`${fieldClass} w-16 shrink-0 px-2 text-sm`}
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
        <h2 id={headingId} className="text-sm tracking-widest text-muted">
          ✦ GENERAR CAMPAÑA CON IA
        </h2>

        {apiKey === null && (
          <>
            <p className="text-sm">Para generar campañas necesitas guardar tu API key de Gemini en Ajustes.</p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={secondaryClass}>
                Cerrar
              </button>
              <button type="button" onClick={onOpenSettings} className={primaryClass}>
                Ir a Ajustes
              </button>
            </div>
          </>
        )}

        {apiKey && step.kind === 'input' && (
          <>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Escribe tu idea o pega una conversación
              <textarea
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                maxLength={MAX_IDEA_LENGTH}
                rows={6}
                placeholder="Ej.: Quiero aprender magia básica con cartas"
                className={`${fieldClass} py-2 leading-snug`}
              />
            </label>
            <p className="-mt-2 text-right text-xs text-muted">
              {idea.length} / {MAX_IDEA_LENGTH}
            </p>
            {step.error && (
              <p role="alert" className="text-sm text-ember">
                {step.error}
              </p>
            )}
            <p className="text-xs text-muted">
              Tu texto se envía a Google Gemini. En el nivel gratuito, Google puede usarlo para mejorar sus productos.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={secondaryClass}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void generate()}
                disabled={!idea.trim() || !aiSettings}
                className={primaryClass}
              >
                Generar
              </button>
            </div>
          </>
        )}

        {step.kind === 'loading' && (
          <>
            <p role="status" className="animate-pulse py-8 text-center text-signal">
              Generando campaña…
            </p>
            <button type="button" onClick={cancelLoading} className={secondaryClass}>
              Cancelar
            </button>
          </>
        )}

        {step.kind === 'preview' && (
          <>
            <p className="text-sm text-muted">Revisa y edita antes de aceptar. Desmarca lo que no quieras.</p>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Campaña
              <input
                value={step.draft.campaign}
                onChange={(event) => updateDraft((draft) => ({ ...draft, campaign: event.target.value }))}
                maxLength={80}
                className={`${fieldClass} font-bold`}
              />
            </label>

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
              <button type="button" onClick={() => setStep({ kind: 'input' })} className={secondaryClass}>
                Volver a generar
              </button>
              <button
                type="button"
                onClick={() => void accept(step.draft)}
                disabled={saving || !step.draft.campaign.trim() || chosen(step.draft.sideQuests).length === 0}
                className={primaryClass}
              >
                Crear campaña
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
