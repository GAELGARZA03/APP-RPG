import { Check, Flame, Minus, Shield, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { ProfileSettings } from '../data/db'
import type { Hud, WeekDay } from '../data/gameStore'
import { Avatar } from './kit/Avatar'
import { Badge } from './kit/Badge'
import { cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { ProgressBar } from './kit/controls'

export function HudCard(props: {
  hud: Hud
  title: string
  profile: ProfileSettings | undefined
  onOpen: () => void
}) {
  const { hud, title, profile, onOpen } = props
  return (
    <motion.section
      aria-label="Nivel y experiencia"
      onClick={onOpen}
      whileTap={{ scale: 0.985 }}
      className={cn(cardSurface, 'cursor-pointer p-5')}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar photo={profile?.photo ?? null} name={profile?.name ?? ''} size="sm" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-muted">
              <Shield aria-hidden className="size-3.5 shrink-0 text-signal" />
              {profile?.name ? `${profile.name} · Nivel ${hud.level}` : `Nivel ${hud.level}`}
            </p>
            <p className="truncate font-display text-2xl font-semibold">{title}</p>
          </div>
        </div>
        {/* Al subir de nivel, el número aparece con un pequeño salto. */}
        <div className="grid size-16 shrink-0 place-items-center rounded-full bg-signal/15 shadow-[0_0_30px_-6px_var(--color-signal)] ring-2 ring-signal/50">
          <motion.span
            key={hud.level}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="font-display text-3xl font-bold text-signal"
            aria-hidden
          >
            {hud.level}
          </motion.span>
        </div>
      </div>
      <ProgressBar
        size="lg"
        value={hud.xpIntoLevel}
        max={hud.xpToNext}
        text={`${hud.xpIntoLevel} / ${hud.xpToNext} XP`}
        label="Experiencia para el siguiente nivel"
      />
    </motion.section>
  )
}

const DAY_STYLES: Record<WeekDay['status'], string> = {
  done: 'border-signal/60 bg-signal/20 text-signal',
  missed: 'border-ember/40 text-ember/80',
  rest: 'border-white/10 text-muted',
  today: 'border-signal bg-void text-signal shadow-[0_0_14px_-4px_var(--color-signal)]',
  'today-done': 'border-signal bg-signal text-on-signal shadow-[0_0_18px_-4px_var(--color-signal)]',
  future: 'border-white/10',
}

const DAY_DESCRIPTIONS: Record<WeekDay['status'], string> = {
  done: 'cumplido',
  missed: 'no cumplido',
  rest: 'sin contratos',
  today: 'hoy, pendiente',
  'today-done': 'hoy, cumplido',
  future: 'próximo',
}

function DayIcon({ status }: { status: WeekDay['status'] }) {
  if (status === 'done' || status === 'today-done') return <Check aria-hidden className="size-4" strokeWidth={3} />
  if (status === 'missed') return <X aria-hidden className="size-3.5" strokeWidth={3} />
  if (status === 'rest') return <Minus aria-hidden className="size-3.5" />
  return null
}

export function StreakCard({ hud, week, onInfo }: { hud: Hud; week: WeekDay[] | undefined; onInfo: () => void }) {
  return (
    <motion.section
      aria-label="Racha"
      onClick={onInfo}
      whileTap={{ scale: 0.985 }}
      className={cn(cardSurface, 'cursor-pointer p-5')}
    >
      <div className="flex items-center gap-4">
        <motion.div
          animate={hud.todayFulfilled ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={{ duration: 0.6 }}
          className="grid size-16 shrink-0 place-items-center rounded-2xl bg-signal/15 shadow-[0_0_34px_-8px_var(--color-signal)]"
        >
          <Flame aria-hidden className="size-9 text-signal" strokeWidth={2.2} />
        </motion.div>
        <div className="flex-1">
          <p className="font-display text-5xl leading-none font-bold text-signal tabular-nums">
            {String(hud.streak).padStart(2, '0')}
          </p>
          <p className="font-display text-base font-medium text-signal/90">
            {hud.streak === 1 ? 'día de racha' : 'días de racha'}
          </p>
        </div>
        <Badge tone="info">Bono +{hud.streakBonusPercent}%</Badge>
      </div>

      {week && (
        <ol className="mt-5 grid grid-cols-7 gap-1" aria-label="Esta semana">
          {week.map((day) => {
            const isToday = day.status === 'today' || day.status === 'today-done'
            return (
              <li
                key={day.day}
                aria-label={`${day.name}: ${DAY_DESCRIPTIONS[day.status]}`}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-full py-1.5',
                  isToday && 'bg-signal/10 ring-1 ring-signal/40',
                )}
              >
                <span className={cn('text-xs font-semibold', isToday ? 'text-signal' : 'text-muted')}>
                  {day.label}
                </span>
                <span className={cn('grid size-7 place-items-center rounded-full border-2', DAY_STYLES[day.status])}>
                  <DayIcon status={day.status} />
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </motion.section>
  )
}
