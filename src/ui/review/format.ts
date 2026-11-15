import { addDays, type GameDay } from '../../game/gameDay'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** «3 al 9 de noviembre» o «28 de octubre al 3 de noviembre». */
export function weekLabel(weekStart: GameDay): string {
  const [, startMonth, startDay] = weekStart.split('-').map(Number)
  const [, endMonth, endDay] = addDays(weekStart, 6).split('-').map(Number)
  return startMonth === endMonth
    ? `${startDay} al ${endDay} de ${MONTHS[endMonth - 1]}`
    : `${startDay} de ${MONTHS[startMonth - 1]} al ${endDay} de ${MONTHS[endMonth - 1]}`
}
