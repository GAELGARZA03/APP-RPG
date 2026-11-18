// Paso final del generador: vista previa editable del diseño antes de crear la campaña.
import { Clock, Flag, Lock, Network, RotateCcw, Skull, Target } from 'lucide-react'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { SectionLabel } from '../kit/Card'
import { cn } from '../kit/cn'
import { DifficultyPips, Field, Input } from '../kit/controls'
import { MissionEditor } from './MissionEditor'
import { chosen, type Draft, type DraftItem } from './draft'

export function PreviewStep(props: {
  draft: Draft
  onChange: (update: (draft: Draft) => Draft) => void
  saving: boolean
  onRedo: () => void
  onAccept: () => void
}) {
  const { draft, onChange } = props

  const changeItem = (list: 'missions' | 'habits', key: number) => (changes: Partial<DraftItem>) =>
    onChange((current) => ({
      ...current,
      [list]: current[list].map((item) => (item.key === key ? { ...item, ...changes } : item)),
    }))

  return (
    <>
      <p className="text-sm text-muted">Revisa y edita antes de aceptar. Desmarca lo que no quieras.</p>
      <Field label="Campaña">
        <Input
          value={draft.campaign}
          onChange={(event) => onChange((current) => ({ ...current, campaign: event.target.value }))}
          maxLength={80}
          className="font-display font-semibold"
        />
      </Field>

      <section
        aria-label="Análisis"
        className="flex flex-col gap-2.5 rounded-2xl border border-info/25 bg-info/[0.06] p-3.5 text-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <SectionLabel icon={Target}>Análisis</SectionLabel>
          {draft.design.analysis.duration && (
            <Badge tone="info">
              <Clock aria-hidden />
              {draft.design.analysis.duration}
            </Badge>
          )}
        </div>
        {draft.design.analysis.diagnosis && (
          <p className="leading-relaxed text-ink/90">{draft.design.analysis.diagnosis}</p>
        )}
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

      <section aria-label="Fases" className="flex flex-col gap-2">
        <SectionLabel icon={Flag}>El camino · {draft.design.acts.length} fases</SectionLabel>
        <ol className="flex flex-col gap-2">
          {draft.design.acts.map((act, index) => (
            <li
              key={`${index}-${act.title}`}
              className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-void/50 p-3"
            >
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
                    Fase {index + 1}: {act.title}
                  </span>
                  <DifficultyPips value={act.difficulty} />
                </p>
                <p className="mt-0.5 text-sm leading-snug text-muted">{act.goal}</p>
                {index > 0 && (
                  <p className="mt-1 text-xs text-muted/80">Sus misiones se generan al llegar, según cómo te vaya.</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Misiones de la Fase 1" className="flex flex-col gap-2">
        <SectionLabel>Misiones de la Fase 1 · {chosen(draft.missions).length}</SectionLabel>
        {draft.missions.map((item) => (
          <MissionEditor key={item.key} item={item} onChange={changeItem('missions', item.key)} />
        ))}
      </section>

      <section aria-label="Misión jefe" className="flex flex-col gap-2">
        <SectionLabel icon={Skull}>Misión jefe · al final de la Fase {draft.design.acts.length}</SectionLabel>
        <MissionEditor
          item={draft.boss}
          boss
          optional={false}
          onChange={(changes) => onChange((current) => ({ ...current, boss: { ...current.boss, ...changes } }))}
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

      {draft.habits.length > 0 && (
        <section aria-label="Hábitos sugeridos" className="flex flex-col gap-2">
          <SectionLabel>Hábitos sugeridos</SectionLabel>
          {draft.habits.map((item) => (
            <MissionEditor key={item.key} item={item} onChange={changeItem('habits', item.key)} />
          ))}
          <p className="text-xs text-muted">Si los marcas, se agregan a tu libreta como hábitos diarios.</p>
        </section>
      )}

      <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-white/[0.06] bg-panel/95 px-5 pt-3 pb-1 backdrop-blur">
        <Button onClick={props.onRedo} className="flex-1 px-3">
          <RotateCcw aria-hidden />
          Rehacer
        </Button>
        <Button
          variant="primary"
          onClick={props.onAccept}
          disabled={props.saving || !draft.campaign.trim() || chosen(draft.missions).length === 0}
          className="flex-[2]"
        >
          Crear campaña
        </Button>
      </div>
    </>
  )
}
