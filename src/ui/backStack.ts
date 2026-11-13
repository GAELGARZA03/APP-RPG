import { useEffect, useRef } from 'react'

/**
 * Pila de acciones para el botón atrás de Android. La pantalla u hoja abierta más reciente
 * responde primero; App recurre a su propia lógica solo si la pila está vacía.
 */
const stack: Array<{ current: () => void }> = []

/** Ejecuta la acción más reciente. Devuelve `false` si no había ninguna. */
export function runBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.current()
  return true
}

/** Mientras `active` sea verdadero, el botón atrás ejecuta `handler` en lugar de salir. */
export function useBack(active: boolean, handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!active) return
    stack.push(ref)
    return () => {
      const index = stack.indexOf(ref)
      if (index !== -1) stack.splice(index, 1)
    }
  }, [active])
}
