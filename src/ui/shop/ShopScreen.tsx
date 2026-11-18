// Tienda: tu oro, tus premios reales, los premios por meta y el historial de canjes.
import { useLiveQuery } from 'dexie-react-hooks'
import { Coins, Gift, History, Pencil, Plus, Repeat, Target, Trophy } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { db } from '../../data/appDb'
import type { Reward } from '../../data/db'
import { getShop, redeemReward } from '../../data/gameStore'
import type { GameDay } from '../../game/gameDay'
import { haptic } from '../../platform/haptics'
import { formatDay } from '../formatDay'
import { Button } from '../kit/Button'
import { cardSurface, SectionLabel } from '../kit/Card'
import { cn } from '../kit/cn'
import { Screen } from '../Screen'
import { Sheet, SheetTitle } from '../Sheet'
import { playComplete } from '../sound'
import { RewardSheet, type RewardDraft } from './RewardSheet'

const EXAMPLES: Array<RewardDraft & { title: string }> = [
  { emoji: '📺', title: 'Un capítulo de mi serie', price: 60 },
  { emoji: '🍦', title: 'Un postre', price: 120 },
  { emoji: '🎮', title: 'Una hora de videojuegos', price: 150 },
  { emoji: '🍕', title: 'Pedir una pizza', price: 400 },
  { emoji: '🛍️', title: 'Comprarme algo que quiero', price: 1500 },
]

export function ShopScreen({ today, onClose }: { today: GameDay; onClose: () => void }) {
  const shop = useLiveQuery(() => getShop(db, today), [today])
  const [editing, setEditing] = useState<{ reward?: Reward; draft?: RewardDraft } | null>(null)
  const [confirming, setConfirming] = useState<Reward | null>(null)
  const [celebrating, setCelebrating] = useState<{ emoji?: string; title: string } | null>(null)

  async function redeem(reward: Reward) {
    setConfirming(null)
    const result = await redeemReward(db, reward.id)
    if (!result.ok) return
    haptic('unlock')
    playComplete()
    setCelebrating({ emoji: reward.emoji, title: reward.title })
    setTimeout(() => setCelebrating(null), 1800)
  }

  return (
    <Screen title="Tienda" onClose={onClose}>
      {shop && (
        <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10">
          <section aria-label="Tu oro" className={cn(cardSurface, 'flex items-center gap-4 p-5')}>
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold shadow-[0_0_30px_-8px_var(--color-gold)]">
              <Coins aria-hidden className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-3xl font-bold text-gold tabular-nums">{shop.wallet.balance}</p>
              <p className="text-xs text-muted">
                Ganaste {shop.wallet.earned} · gastaste {shop.wallet.spent}. Ganas 1 de oro por cada 10 XP y 20 por
                cerrar una fase.
              </p>
            </div>
          </section>

          {shop.earned.length > 0 && (
            <section aria-label="Premios ganados" className="flex flex-col gap-2">
              <SectionLabel icon={Trophy}>¡Premios ganados!</SectionLabel>
              {shop.earned.map((reward) => (
                <RewardRow
                  key={reward.id}
                  reward={reward}
                  detail={reward.goal?.label}
                  free
                  onRedeem={() => setConfirming(reward)}
                />
              ))}
            </section>
          )}

          <section aria-label="Tus premios" className="flex flex-col gap-2">
            <SectionLabel icon={Gift}>Tus premios</SectionLabel>
            {shop.items.length === 0 && (
              <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-white/15 p-3">
                <p className="text-sm text-muted">Ponle precio a lo que disfrutas. Algunas ideas para empezar:</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.title}
                      type="button"
                      onClick={() => setEditing({ draft: example })}
                      className="min-h-10 rounded-full border border-white/[0.08] bg-void/50 px-3 text-sm text-muted active:border-gold"
                    >
                      {example.emoji} {example.title} · {example.price}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {shop.items.map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                balance={shop.wallet.balance}
                onRedeem={() => setConfirming(reward)}
                onEdit={() => setEditing({ reward })}
              />
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="dashed" onClick={() => setEditing({ draft: {} })}>
                <Plus aria-hidden />
                Nuevo premio
              </Button>
              <Button variant="dashed" onClick={() => setEditing({ draft: { goal: true } })}>
                <Target aria-hidden />
                Premio por meta
              </Button>
            </div>
          </section>

          {shop.goals.length > 0 && (
            <section aria-label="Metas con premio" className="flex flex-col gap-2">
              <SectionLabel icon={Target}>Metas con premio</SectionLabel>
              {shop.goals.map((reward) => (
                <div
                  key={reward.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised text-xl">
                    {reward.emoji ?? '🎁'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{reward.title}</span>
                    <span className="block truncate text-xs text-muted">{reward.goal?.label}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-info">{reward.progress}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${reward.title}`}
                    onClick={() => setEditing({ reward })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                </div>
              ))}
            </section>
          )}

          {shop.history.length > 0 && (
            <section aria-label="Historial de canjes" className="flex flex-col gap-2">
              <SectionLabel icon={History}>Historial</SectionLabel>
              <ul className="flex flex-col gap-1.5 text-sm">
                {shop.history.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-muted">
                    <span className="text-base">{item.emoji ?? '🎁'}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
                    <span className="shrink-0 text-xs first-letter:uppercase">{formatDay(item.day)}</span>
                    <span className="w-14 shrink-0 text-right text-xs font-semibold text-gold tabular-nums">
                      {item.cost > 0 ? `−${item.cost}` : 'gratis'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {editing && (
        <RewardSheet today={today} reward={editing.reward} draft={editing.draft} onClose={() => setEditing(null)} />
      )}
      {confirming && (
        <ConfirmRedeem
          reward={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void redeem(confirming)}
        />
      )}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0.4, rotate: -10 }}
              animate={{ scale: [0.4, 1.25, 1], rotate: [-10, 6, 0] }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <span className="text-7xl drop-shadow-[0_0_30px_var(--color-gold)]">{celebrating.emoji ?? '🎁'}</span>
              <p className="font-display text-2xl font-bold text-gold">¡Disfrútalo!</p>
              <p className="text-sm text-ink/90">{celebrating.title}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

function RewardRow(props: {
  reward: Reward
  balance?: number
  free?: boolean
  detail?: string
  onRedeem: () => void
  onEdit?: () => void
}) {
  const { reward, balance = 0, free } = props
  const missing = free ? 0 : Math.max(0, reward.price - balance)
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3',
        free ? 'border-gold/40 bg-gold/[0.07]' : 'border-white/[0.06] bg-void/50',
      )}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-raised text-2xl">
        {reward.emoji ?? '🎁'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{reward.title}</span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {free ? (
            <span className="truncate">{props.detail}</span>
          ) : (
            <>
              <span className="flex items-center gap-1 font-semibold text-gold">
                <Coins aria-hidden className="size-3.5" />
                {reward.price}
              </span>
              {reward.repeatable && (
                <span className="flex items-center gap-1">
                  <Repeat aria-hidden className="size-3" />
                  repetible
                </span>
              )}
            </>
          )}
        </span>
      </span>
      {props.onEdit && (
        <Button size="icon" variant="ghost" aria-label={`Editar ${reward.title}`} onClick={props.onEdit}>
          <Pencil aria-hidden />
        </Button>
      )}
      <Button size="sm" variant={missing > 0 ? 'secondary' : 'primary'} disabled={missing > 0} onClick={props.onRedeem}>
        {missing > 0 ? `Faltan ${missing}` : free ? 'Canjear gratis' : 'Canjear'}
      </Button>
    </div>
  )
}

function ConfirmRedeem(props: { reward: Reward; onCancel: () => void; onConfirm: () => void }) {
  const headingId = useId()
  const { reward } = props
  return (
    <Sheet labelledBy={headingId} focusSheet onClose={props.onCancel}>
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-6xl">{reward.emoji ?? '🎁'}</span>
        <SheetTitle id={headingId}>¿Canjear «{reward.title}»?</SheetTitle>
        <p className="text-sm text-muted">
          {reward.goal ? 'Te lo ganaste con tu meta: no cuesta oro.' : `Se descuentan ${reward.price} de oro.`}
          {!reward.goal && !reward.repeatable && ' Es de una sola vez.'}
        </p>
        <div className="flex w-full gap-2">
          <Button onClick={props.onCancel} className="flex-1">
            Todavía no
          </Button>
          <Button variant="primary" onClick={props.onConfirm} className="flex-1">
            <Gift aria-hidden />
            Canjear
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
