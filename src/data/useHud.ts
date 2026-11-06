import { useEffect, useState } from 'react'
import { GameDatabase } from './db'
import { getHud, type Hud } from './gameStore'

const db = new GameDatabase()

export function useHud() {
  const [hud, setHud] = useState<Hud | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let ignored = false

    function refresh() {
      if (document.visibilityState !== 'visible') return

      getHud(db)
        .then((nextHud) => {
          if (!ignored) setHud(nextHud)
        })
        .catch((error: unknown) => {
          console.error(error)
          if (!ignored) setFailed(true)
        })
    }

    refresh()
    // Al volver a la app puede haber pasado el cierre del día.
    document.addEventListener('visibilitychange', refresh)

    return () => {
      ignored = true
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return { hud, failed }
}
