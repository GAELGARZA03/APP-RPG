import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind y resuelve conflictos (la última gana). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
