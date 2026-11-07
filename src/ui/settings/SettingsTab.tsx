import { Capacitor } from '@capacitor/core'
import { baseXp, type Difficulty } from '../../game/rules'
import { Panel } from '../parts'
import { BackupPanel } from './BackupPanel'
import { GeminiPanel } from './GeminiPanel'
import { RemindersPanel } from './RemindersPanel'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

export function SettingsTab() {
  return (
    <>
      <RemindersPanel />
      <BackupPanel />
      <GeminiPanel />

      <Panel label="Reglas">
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            XP por dificultad:{' '}
            <span className="text-signal">
              {DIFFICULTIES.map((difficulty) => baseXp(difficulty)).join(' / ')}
            </span>
          </li>
          <li>Completa todos tus contratos diarios para sumar un día de racha.</li>
          <li>Cada día de racha da +5% de XP en contratos, hasta +50%.</li>
          <li>Fallar un día reduce la racha a la mitad.</li>
          <li>El día cierra a las 4:00 a. m.</li>
        </ul>
      </Panel>

      <Panel label="Sistema">
        <p className="text-sm">
          Plataforma: <span className="text-signal">{Capacitor.getPlatform()}</span>
        </p>
      </Panel>
    </>
  )
}
