/** «domingo, 15 de noviembre» para un día de juego (YYYY-MM-DD). */
export function formatDay(day: string) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}
