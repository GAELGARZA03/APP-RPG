import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Hoja inferior modal. Se cierra con Escape o con el botón atrás (lo maneja App).
 * Con `focusSheet`, el foco queda en la hoja en lugar del primer campo, y no se abre el teclado.
 */
export function Sheet(props: {
  labelledBy: string
  focusSheet?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { labelledBy, focusSheet = false, onClose, children } = props
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    if (focusSheet) dialog.focus()
  }, [focusSheet])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={onClose}
      tabIndex={-1}
      className="sheet mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] border border-b-0 border-white/[0.08] bg-panel px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-ink outline-none"
    >
      <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
      {children}
    </dialog>
  )
}

export function SheetTitle({ id, icon, children }: { id: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 font-display text-lg font-semibold">
      {icon}
      {children}
    </h2>
  )
}
