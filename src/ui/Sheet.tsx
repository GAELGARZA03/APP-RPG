import { X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

/** Hojas abiertas a la vez: mientras haya alguna, la página de atrás no se desplaza. */
let openSheets = 0

/**
 * Hoja inferior modal. Se cierra con el botón ✕, tocando fuera, deslizando la barrita hacia abajo, con Escape
 * o con el botón atrás (lo maneja App). Con `focusSheet`, el foco queda en la hoja en lugar del primer campo,
 * y no se abre el teclado.
 */
export function Sheet(props: { labelledBy: string; focusSheet?: boolean; onClose: () => void; children: ReactNode }) {
  const { labelledBy, focusSheet = false, onClose, children } = props
  const dialogRef = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ startY: number } | null>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    if (focusSheet) dialog.focus()
  }, [focusSheet])

  // Con la hoja abierta, lo de atrás no se mueve al deslizar.
  useEffect(() => {
    openSheets += 1
    document.documentElement.style.overflow = 'hidden'
    return () => {
      openSheets -= 1
      if (openSheets === 0) document.documentElement.style.overflow = ''
    }
  }, [])

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    drag.current = { startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) setOffset(Math.max(0, event.clientY - drag.current.startY))
  }
  function endDrag() {
    if (!drag.current) return
    drag.current = null
    // Si se bajó lo suficiente, se cierra; si no, regresa a su lugar.
    if (offset > 90) onClose()
    else setOffset(0)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={onClose}
      // Un toque en el fondo (fuera de la hoja) llega al propio <dialog>: cierra.
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      tabIndex={-1}
      style={offset ? { transform: `translateY(${offset}px)`, transition: 'none' } : undefined}
      className="sheet mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-md overflow-hidden rounded-t-[2rem] border border-b-0 border-white/[0.08] bg-panel p-0 text-ink outline-none transition-transform"
    >
      <div className="relative max-h-[92dvh] overflow-y-auto overscroll-contain px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div
          aria-hidden
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="-mx-5 mb-2 flex h-7 cursor-grab touch-none items-center justify-center"
        >
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-2 right-3 z-10 grid size-10 place-items-center rounded-full text-muted active:bg-raised"
        >
          <X aria-hidden className="size-5" />
        </button>
        {children}
      </div>
    </dialog>
  )
}

export function SheetTitle({ id, icon, children }: { id: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 pr-10 font-display text-lg font-semibold">
      {icon}
      {children}
    </h2>
  )
}
