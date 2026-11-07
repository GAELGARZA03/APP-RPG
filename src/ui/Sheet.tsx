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
      className="mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-xl border border-b-0 border-line bg-panel px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-ink outline-none backdrop:bg-black/70"
    >
      {children}
    </dialog>
  )
}
