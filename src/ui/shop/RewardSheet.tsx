// Crear o editar un premio: con precio en oro, o ganado al cumplir una meta.
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Coins, Gift, Target } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { db } from '../../data/appDb'
import type { Reward, RewardGoal } from '../../data/db'
import {
  archiveReward,
  createReward,
  getHabits,
  getMissions,
  MAX_REWARD_PRICE,
  updateReward,
} from '../../data/gameStore'
import { isResolved } from '../../game/rules'
import type { GameDay } from '../../game/gameDay'
import { Button } from '../kit/Button'
import { cn } from '../kit/cn'
import { Field, Input, SettingRow, Switch } from '../kit/controls'
import { Sheet, SheetTitle } from '../Sheet'

type GoalKind = RewardGoal['kind']
const GOAL_KINDS: Array<{ id: GoalKind; label: string }> = [
  { id: 'campaign', label: 'Terminar una campaña' },
  { id: 'act', label: 'Cerrar una fase' },
  { id: 'quest', label: 'Completar una misión' },
  { id: 'habitStreak', label: 'Racha de un hábito' },
]

export interface RewardDraft {
  title?: string
  emoji?: string
  price?: number
  goal?: boolean
}

export function RewardSheet(props: { today: GameDay; reward?: Reward; draft?: RewardDraft; onClose: () => void }) {
  const { reward, draft } = props
  const headingId = useId()
  const editing = reward !== undefined
  const [byGoal, setByGoal] = useState(reward ? Boolean(reward.goal) : Boolean(draft?.goal))
  const [title, setTitle] = useState(reward?.title ?? draft?.title ?? '')
  const [emoji, setEmoji] = useState(reward?.emoji ?? draft?.emoji ?? '')
  const [price, setPrice] = useState(String(reward?.price || draft?.price || 100))
  const [repeatable, setRepeatable] = useState(reward?.repeatable ?? true)
  const [goalKind, setGoalKind] = useState<GoalKind>('campaign')
  const [targetId, setTargetId] = useState('')
  const [days, setDays] = useState('7')
  const [query, setQuery] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)

  const missions = useLiveQuery(() => getMissions(db), [])
  const habits = useLiveQuery(() => getHabits(db, props.today), [props.today])

  // Opciones de meta, con el texto que se guardará como descripción.
  const campaigns = (missions?.campaigns ?? []).filter((campaign) => campaign.currentAct !== null)
  const options: Record<GoalKind, Array<{ id: string; label: string }>> = {
    campaign: campaigns.map((campaign) => ({ id: campaign.id, label: `Terminar «${campaign.title}»` })),
    act: campaigns.flatMap((campaign) =>
      campaign.legacy
        ? []
        : campaign.actViews
            .filter((act) => act.state !== 'done')
            .map((act) => ({ id: act.id, label: `Cerrar la Fase ${act.number} de «${campaign.title}»` })),
    ),
    quest: [...campaigns.flatMap((campaign) => campaign.sideQuests), ...(missions?.looseSideQuests ?? [])]
      .filter((quest) => !isResolved(quest))
      .map((quest) => ({ id: quest.id, label: `Completar «${quest.title}»` })),
    habitStreak: (habits ?? []).map((habit) => ({ id: habit.id, label: habit.title })),
  }
  const target = options[goalKind].find((option) => option.id === targetId) ?? options[goalKind][0]
  // Con muchas opciones (por ejemplo, decenas de misiones) aparece un buscador.
  const searchable = options[goalKind].length > 6
  const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const visible =
    searchable && query.trim()
      ? options[goalKind].filter((option) => normalize(option.label).includes(normalize(query.trim())))
      : options[goalKind]
  const dayCount = Math.min(365, Math.max(1, Number(days) || 1))
  const priceValue = Math.min(MAX_REWARD_PRICE, Math.max(1, Math.round(Number(price) || 0)))

  function goal(): RewardGoal | undefined {
    if (!byGoal || !target) return undefined
    if (goalKind === 'habitStreak') {
      return {
        kind: 'habitStreak',
        targetId: target.id,
        days: dayCount,
        label: `${dayCount} días seguidos: «${target.label}»`,
      }
    }
    return { kind: goalKind, targetId: target.id, label: target.label }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    if (editing) await updateReward(db, reward.id, { title, emoji, price: priceValue, repeatable })
    else await createReward(db, { title, emoji, price: priceValue, repeatable, goal: goal() })
    props.onClose()
  }

  const canSave = title.trim() !== '' && (editing || !byGoal || target !== undefined)

  return (
    <Sheet labelledBy={headingId} focusSheet={editing} onClose={props.onClose}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <SheetTitle id={headingId} icon={<Gift aria-hidden className="size-5 text-gold" />}>
          {editing ? 'Editar premio' : 'Nuevo premio'}
        </SheetTitle>

        {!editing && (
          <div
            role="radiogroup"
            aria-label="Cómo se gana"
            className="grid grid-cols-2 gap-1 rounded-2xl bg-raised/70 p-1"
          >
            {[
              { value: false, label: 'Con oro', icon: Coins },
              { value: true, label: 'Por una meta', icon: Target },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={byGoal === option.value}
                onClick={() => setByGoal(option.value)}
                className={cn(
                  'flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium',
                  byGoal === option.value ? 'bg-signal text-on-signal' : 'text-muted',
                )}
              >
                <option.icon aria-hidden className="size-4" />
                {option.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Field label="Emoji">
            <Input
              value={emoji}
              onChange={(event) => setEmoji(event.target.value)}
              maxLength={8}
              placeholder="🍕"
              className="w-16 text-center text-xl"
            />
          </Field>
          <div className="min-w-0 flex-1">
            <Field label="Premio">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                required
                autoFocus={!editing && !draft?.title}
                placeholder="Pedir una pizza"
              />
            </Field>
          </div>
        </div>

        {!byGoal && (
          <>
            <Field label="Precio en oro" hint="Ganas 1 de oro por cada 10 XP y 20 por cerrar una fase.">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_REWARD_PRICE}
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="w-32"
              />
            </Field>
            <SettingRow label="Se puede canjear varias veces" description="Si lo apagas, desaparece al canjearlo.">
              <Switch label="Se puede canjear varias veces" checked={repeatable} onChange={setRepeatable} />
            </SettingRow>
          </>
        )}

        {byGoal && !editing && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-xs font-medium text-muted">Meta</legend>
              <div className="grid grid-cols-2 gap-2">
                {GOAL_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    aria-pressed={goalKind === kind.id}
                    onClick={() => {
                      setGoalKind(kind.id)
                      setTargetId('')
                      setQuery('')
                    }}
                    className={cn(
                      'min-h-12 rounded-2xl border px-2 text-sm leading-tight',
                      goalKind === kind.id
                        ? 'border-info bg-info/15 text-info'
                        : 'border-white/[0.06] bg-void/50 text-muted',
                    )}
                  >
                    {kind.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {options[goalKind].length === 0 ? (
              <p className="text-sm text-muted">No hay nada pendiente de este tipo.</p>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-xs font-medium text-muted">
                  {goalKind === 'habitStreak' ? 'Hábito' : 'Cuál'} · {options[goalKind].length}
                </legend>
                {searchable && (
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar…"
                    aria-label="Buscar"
                    enterKeyHint="search"
                  />
                )}
                <div role="radiogroup" className="flex max-h-56 flex-col gap-1.5 overflow-y-auto overscroll-contain">
                  {visible.length === 0 && <p className="px-1 text-sm text-muted">Nada coincide con «{query}».</p>}
                  {visible.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={target?.id === option.id}
                      onClick={() => setTargetId(option.id)}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 text-left text-sm',
                        target?.id === option.id ? 'border-signal bg-signal/10' : 'border-white/[0.06] bg-void/50',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded-full border-2',
                          target?.id === option.id ? 'border-signal' : 'border-white/25',
                        )}
                      >
                        {target?.id === option.id && <span className="size-2 rounded-full bg-signal" />}
                      </span>
                      <span className="min-w-0 flex-1">{option.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {goalKind === 'habitStreak' && (
              <Field label="Días seguidos">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                  className="w-24"
                />
              </Field>
            )}
            <p className="text-xs text-muted">Al cumplirla te avisamos y el premio queda listo para canjear, gratis.</p>
          </>
        )}

        {editing && reward.goal && <p className="text-sm text-muted">Meta: {reward.goal.label}</p>}

        {editing && (
          <Button
            variant={confirmArchive ? 'danger' : 'ghost'}
            onClick={() => {
              if (!confirmArchive) return setConfirmArchive(true)
              void archiveReward(db, reward.id).then(props.onClose)
            }}
          >
            <Archive aria-hidden />
            {confirmArchive ? 'Toca otra vez para quitarlo (el historial se conserva)' : 'Quitar de la tienda'}
          </Button>
        )}

        {/* Siempre a la vista, abajo, aunque el formulario sea largo. */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-1 flex gap-2 border-t border-white/[0.06] bg-panel/95 px-5 pt-3 pb-2 backdrop-blur">
          <Button onClick={props.onClose} className="flex-1">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave} className="flex-1">
            {editing ? 'Guardar' : 'Crear'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
