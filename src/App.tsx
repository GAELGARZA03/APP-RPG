import { Capacitor } from '@capacitor/core'
import { useHud } from './data/useHud'

export function App() {
  const { hud, failed } = useHud()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header>
        <p className="text-xs tracking-[0.3em] text-muted">REAL LIFE RPG</p>
      </header>

      {hud && (
        <section aria-label="HUD del jugador" className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted">NIVEL</p>
              <p className="text-5xl leading-none font-bold text-signal">{hud.level}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted">RACHA</p>
              <p className="text-3xl leading-none font-bold text-ember">
                {hud.streak} <span className="text-sm font-normal text-muted">días</span>
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-muted">
              <span>XP</span>
              <span>
                {hud.xpIntoLevel} / {hud.xpToNext}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Experiencia para el siguiente nivel"
              aria-valuemin={0}
              aria-valuemax={hud.xpToNext}
              aria-valuenow={hud.xpIntoLevel}
              className="h-3 overflow-hidden rounded-sm border border-line bg-void"
            >
              <div
                className="h-full bg-signal"
                style={{ width: `${(hud.xpIntoLevel / hud.xpToNext) * 100}%` }}
              />
            </div>
          </div>
        </section>
      )}

      <section aria-label="Estado del sistema" className="rounded-lg border border-line bg-panel p-4 text-sm">
        <p className="text-xs text-muted">SISTEMA</p>
        <p className="mt-1">
          Plataforma: <span className="text-signal">{Capacitor.getPlatform()}</span>
        </p>
        <p>
          Datos:{' '}
          {failed ? (
            <span className="text-ember">error al cargar</span>
          ) : (
            <span className="text-signal">{hud ? 'listos' : 'cargando'}</span>
          )}
        </p>
      </section>
    </main>
  )
}
