import { Check } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import type { Difficulty } from '../../game/rules'
import { cn } from './cn'

const fieldClass =
  'min-h-12 w-full rounded-2xl border border-white/[0.08] bg-void/70 px-4 text-base text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-signal disabled:opacity-40'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  // Sin esquina para redimensionar: el cuadro crece solo con el texto.
  return (
    <textarea
      className={cn(fieldClass, 'min-h-24 resize-none py-3 leading-snug [field-sizing:content]', className)}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors disabled:opacity-40',
        props.checked ? 'justify-end border-signal bg-signal' : 'justify-start border-line bg-raised',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className={cn('size-5 rounded-full', props.checked ? 'bg-on-signal' : 'bg-muted')}
      />
    </button>
  )
}

/** Fila con texto a la izquierda y un control a la derecha. */
export function SettingRow({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/** Casilla grande para completar tareas, con animación al marcar. */
export function CheckButton({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      whileTap={{ scale: 0.85 }}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200',
        checked
          ? 'border-signal bg-signal text-on-signal shadow-[0_0_18px_-4px_var(--color-signal)]'
          : 'border-white/15 bg-void/60',
      )}
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          >
            <Check aria-hidden className="size-6" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/**
 * Barra de progreso. En tamaño `lg` es una píldora gruesa con el texto dentro.
 */
export function ProgressBar(props: { value: number; max: number; label: string; size?: 'md' | 'lg'; text?: string }) {
  const percent = props.max === 0 ? 0 : Math.min(100, (props.value / props.max) * 100)
  const large = props.size === 'lg'

  return (
    <div
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={props.max}
      aria-valuenow={props.value}
      className={cn(
        'relative overflow-hidden rounded-full bg-void/80 shadow-[inset_0_2px_6px_rgb(0_0_0/0.5)] ring-1 ring-white/[0.06]',
        large ? 'h-8' : 'h-3',
      )}
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-b from-[color-mix(in_srgb,var(--color-signal)_75%,white)] to-signal shadow-[0_0_16px_-2px_var(--color-signal)]"
        initial={false}
        animate={{ width: `${percent}%` }}
        transition={{ type: 'spring', stiffness: 110, damping: 20 }}
      />
      {large && props.text && (
        <span className="absolute inset-0 grid place-items-center font-display text-sm font-semibold text-ink [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
          {props.text}
        </span>
      )}
    </div>
  )
}

export function DifficultyPips({ value }: { value: Difficulty }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`Dificultad ${value} de 5`}>
      {[1, 2, 3, 4, 5].map((pip) => (
        <span key={pip} className={cn('size-1.5 rounded-full', pip <= value ? 'bg-info' : 'bg-white/15')} />
      ))}
    </span>
  )
}
