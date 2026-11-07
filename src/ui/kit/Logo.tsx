import { cn } from './cn'

/** Emblema de la app (el mismo dibujo que el icono de Android), en el color principal del tema. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="28 22 56 62" aria-hidden className={cn('text-signal', className)}>
      <path
        d="M54,30 L74.8,42 L74.8,66 L54,78 L33.2,66 L33.2,42 Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M43,67 L54,56 L65,67"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M43,56 L54,45 L65,56"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M74,27 L75.4,31.6 L80,33 L75.4,34.4 L74,39 L72.6,34.4 L68,33 L72.6,31.6 Z" fill="#efffd9" />
    </svg>
  )
}

/** Logotipo completo: emblema y nombre. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5" aria-label="Real Life RPG">
      <LogoMark className="size-8 drop-shadow-[0_0_10px_var(--color-signal)]" />
      <span aria-hidden className="flex items-center gap-1.5 font-display text-xl font-semibold tracking-tight">
        Real Life
        <span className="rounded-md bg-signal px-1.5 py-0.5 text-xs leading-none font-bold tracking-wider text-on-signal">
          RPG
        </span>
      </span>
    </span>
  )
}
