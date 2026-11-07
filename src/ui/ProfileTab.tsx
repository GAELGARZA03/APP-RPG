import { Award, Check, CheckCheck, Flame, Lock, Monitor, Music, Palette, Shield, Sparkles, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { db } from '../data/appDb'
import type { Hud } from '../data/gameStore'
import { saveCosmetics } from '../data/settings'
import {
  CRT_EFFECT,
  effectiveCosmetics,
  nextUnlock,
  SOUNDS,
  THEMES,
  TITLES,
  titleName,
  type CosmeticChoice,
} from '../game/cosmetics'
import { Badge } from './kit/Badge'
import { Card, cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { SettingRow, Switch } from './kit/controls'
import { playComplete } from './sound'

function Option(props: {
  label: string
  requiredLevel: number
  level: number
  selected: boolean
  onSelect: () => void
  preview?: ReactNode
}) {
  const locked = props.requiredLevel > props.level

  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      className={cn(
        'flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border px-4 text-left text-sm transition-colors',
        props.selected
          ? 'border-signal bg-signal/10 text-signal'
          : locked
            ? 'border-white/[0.04] text-muted'
            : 'border-white/[0.06] bg-void/50 active:border-signal',
      )}
    >
      <span className="flex items-center gap-2.5">
        {props.preview}
        {props.label}
      </span>
      {locked ? (
        <Badge>
          <Lock aria-hidden />
          Nv. {props.requiredLevel}
        </Badge>
      ) : (
        props.selected && <Check aria-hidden className="size-4" />
      )}
    </button>
  )
}

export function ProfileTab({ hud, choice }: { hud: Hud; choice: CosmeticChoice }) {
  const { level } = hud
  const active = effectiveCosmetics(choice, level)
  const next = nextUnlock(level)
  const select = (changes: Partial<CosmeticChoice>) => void saveCosmetics(db, changes)
  const crtLocked = level < CRT_EFFECT.level

  return (
    <>
      <section aria-label="Perfil" className={cn(cardSurface, 'p-5 text-center')}>
        <div className="mx-auto mb-3 grid size-20 place-items-center rounded-full bg-signal/15 shadow-[0_0_40px_-8px_var(--color-signal)] ring-2 ring-signal/50">
          <Trophy aria-hidden className="size-10 text-signal" />
        </div>
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Título</p>
        <p className="font-display text-3xl leading-tight font-bold text-signal">{titleName(active.title)}</p>
        <div className="mt-4 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm">
          {next ? (
            <>
              <p className="text-xs text-muted">Próximo desbloqueo · nivel {next.level}</p>
              <p className="mt-0.5 font-medium text-info">{next.labels.join(', ')}</p>
            </>
          ) : (
            <p className="text-info">Desbloqueaste todas las recompensas.</p>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Shield, value: level, label: 'Nivel' },
          { icon: Sparkles, value: hud.totalXp, label: 'XP total' },
          { icon: Flame, value: hud.streak, label: 'Racha actual' },
          { icon: CheckCheck, value: hud.completedTasks, label: 'Tareas completadas' },
        ].map(({ icon: Icon, value, label }) => (
          <div key={label} className={cn(cardSurface, 'p-4')}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-white/[0.06]">
                <Icon aria-hidden className="size-4 text-muted" />
              </span>
              <span className="font-display text-xl font-semibold text-signal tabular-nums">{value}</span>
            </div>
            <p className="text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>

      <Card label="Títulos" icon={Award}>
        <div className="flex flex-col gap-2">
          {TITLES.map((title) => (
            <Option
              key={title.id}
              label={title.name}
              requiredLevel={title.level}
              level={level}
              selected={active.title === title.id}
              onSelect={() => select({ title: title.id })}
            />
          ))}
        </div>
      </Card>

      <Card label="Temas" icon={Palette}>
        <div className="flex flex-col gap-2">
          {THEMES.map((theme) => (
            <Option
              key={theme.id}
              label={theme.name}
              requiredLevel={theme.level}
              level={level}
              selected={active.theme === theme.id}
              onSelect={() => select({ theme: theme.id })}
              preview={
                <span aria-hidden className="flex overflow-hidden rounded-md ring-1 ring-line">
                  <span className="size-5" style={{ background: theme.swatch[0] }} />
                  <span className="size-5" style={{ background: theme.swatch[1] }} />
                </span>
              }
            />
          ))}
        </div>
      </Card>

      <Card label="Sonidos" icon={Music}>
        <div className="flex flex-col gap-2">
          {SOUNDS.map((sound) => (
            <Option
              key={sound.id}
              label={sound.name}
              requiredLevel={sound.level}
              level={level}
              selected={active.sound === sound.id}
              onSelect={() => {
                select({ sound: sound.id })
                playComplete(sound.id)
              }}
            />
          ))}
        </div>
      </Card>

      <Card label="Efectos" icon={Monitor}>
        <SettingRow label={CRT_EFFECT.name} description="Líneas de pantalla retro">
          {crtLocked ? (
            <Badge>
              <Lock aria-hidden />
              Nv. {CRT_EFFECT.level}
            </Badge>
          ) : (
            <Switch label={CRT_EFFECT.name} checked={active.crt} onChange={(crt) => select({ crt })} />
          )}
        </SettingRow>
      </Card>
    </>
  )
}
