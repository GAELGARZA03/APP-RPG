import { useEffect, useState } from 'react'
import { gameDayOf, type GameDay } from '../game/gameDay'

/** Día de juego actual. Se actualiza solo al pasar el cierre de las 4:00 a. m. */
export function useGameDay(): GameDay {
  const [today, setToday] = useState(() => gameDayOf(new Date()))

  useEffect(() => {
    const update = () => setToday(gameDayOf(new Date()))
    const timer = setInterval(update, 30_000)
    document.addEventListener('visibilitychange', update)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return today
}
