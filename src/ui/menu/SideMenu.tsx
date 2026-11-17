import { BookMarked, BookOpen, Gift, Info, Settings, UserRound, X, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useBack } from '../backStack'
import { Button } from '../kit/Button'
import { Logo } from '../kit/Logo'

export type MenuDestination = 'profile' | 'shop' | 'library' | 'settings' | 'rules' | 'about'

const ITEMS: Array<{ id: MenuDestination; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'profile', label: 'Perfil', hint: 'Nivel, árbol de habilidades, títulos y temas', icon: UserRound },
  { id: 'shop', label: 'Tienda', hint: 'Canjea tu oro por premios reales', icon: Gift },
  { id: 'library', label: 'Biblioteca', hint: 'Los principios en los que se basa la IA', icon: BookMarked },
  { id: 'settings', label: 'Ajustes', hint: 'Recordatorios, IA y respaldo', icon: Settings },
  { id: 'rules', label: 'Reglas del juego', hint: 'XP, rachas, hábitos y actos', icon: BookOpen },
  { id: 'about', label: 'Acerca de', hint: 'Versión y privacidad', icon: Info },
]

/** Menú lateral que se abre con el logotipo: lo que no necesita una pestaña propia. */
export function SideMenu({
  onClose,
  onSelect,
}: {
  onClose: () => void
  onSelect: (destination: MenuDestination) => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  // El botón atrás de Android cierra el menú antes que nada.
  useBack(true, onClose)
  useEffect(() => panel.current?.focus(), [])

  return (
    <div className="fixed inset-0 z-40">
      <motion.button
        type="button"
        aria-label="Cerrar menú"
        tabIndex={-1}
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/60"
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        tabIndex={-1}
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 40 }}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col gap-2 border-r border-white/[0.08] bg-panel px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl outline-none"
      >
        <div className="mb-3 flex items-center justify-between pl-2">
          <Logo />
          <Button variant="ghost" size="icon" aria-label="Cerrar menú" onClick={onClose}>
            <X aria-hidden />
          </Button>
        </div>
        {ITEMS.map(({ id, label, hint, icon: Icon }) => (
          <motion.button
            key={id}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(id)}
            className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 text-left active:bg-raised"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal/10 text-signal">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
