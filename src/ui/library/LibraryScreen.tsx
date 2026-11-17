// Biblioteca: los principios en los que se basa la IA al diseñar campañas, misiones, hábitos y revisiones.
import { ChevronDown } from 'lucide-react'
import { PRINCIPLE_GROUPS, PRINCIPLES } from '../../game/library'
import { cardSurface, SectionLabel } from '../kit/Card'
import { cn } from '../kit/cn'
import { Screen } from '../Screen'
import { PrincipleBody } from './PrincipleChip'

export function LibraryScreen({ onClose }: { onClose: () => void }) {
  return (
    <Screen title="Biblioteca" onClose={onClose}>
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-10">
        <p className="text-sm text-muted">
          Cuando la IA diseña tus campañas, misiones, hábitos y revisiones, se basa solo en estos principios de libros e
          investigación sobre hábitos y aprendizaje. Cada misión o hábito que genera dice en cuál se basó.
        </p>
        {PRINCIPLE_GROUPS.map((group) => (
          <section key={group.id} aria-label={group.name} className="flex flex-col gap-2">
            <SectionLabel>{group.name}</SectionLabel>
            {PRINCIPLES.filter((principle) => principle.group === group.id).map((principle) => (
              <details key={principle.id} className={cn(cardSurface, 'group p-0')}>
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="w-7 shrink-0 font-display text-xs font-bold text-signal">{principle.id}</span>
                  <span className="min-w-0 flex-1 font-medium">{principle.name}</span>
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="px-4 pb-4">
                  <PrincipleBody principle={principle} />
                </div>
              </details>
            ))}
          </section>
        ))}
      </div>
    </Screen>
  )
}
