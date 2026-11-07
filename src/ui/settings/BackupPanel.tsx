import { useLiveQuery } from 'dexie-react-hooks'
import { DatabaseBackup, Download, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../../data/appDb'
import {
  backupFileName,
  BackupError,
  createBackup,
  parseBackup,
  restoreBackup,
  summarizeBackup,
  type Backup,
} from '../../data/backup'
import { getLastBackupAt, markBackupDone } from '../../data/settings'
import { saveTextFile } from '../../platform/files'
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'

const DAY_MS = 24 * 60 * 60 * 1000

function describeLastBackup(lastBackupAt: string | null) {
  if (!lastBackupAt) return { text: 'nunca', stale: true }
  const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / DAY_MS)
  return {
    text: days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`,
    stale: days > 7,
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function BackupPanel({ embedded, headingId }: { embedded?: boolean; headingId?: string } = {}) {
  const lastBackupAt = useLiveQuery(() => getLastBackupAt(db), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const confirmation = useRef<HTMLDivElement>(null)

  // La confirmación aparece debajo de los botones; se lleva a la vista para que no pase desapercibida.
  useEffect(() => {
    if (pending) confirmation.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pending])

  async function exportBackup() {
    setMessage(null)
    const now = new Date()
    const backup = await createBackup(db, now)
    const saved = await saveTextFile(backupFileName(now), JSON.stringify(backup, null, 2))
    if (!saved) {
      setMessage({ error: true, text: 'No se guardó el respaldo.' })
      return
    }
    await markBackupDone(db, now)
    setMessage({ error: false, text: 'Respaldo listo. Guárdalo fuera del teléfono, por ejemplo en Drive.' })
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage(null)
    try {
      setPending(parseBackup(await file.text()))
    } catch (error) {
      setMessage({ error: true, text: error instanceof BackupError ? error.message : 'No se pudo leer el archivo.' })
    }
  }

  async function importBackup(backup: Backup) {
    try {
      await restoreBackup(db, backup)
      setMessage({ error: false, text: 'Respaldo importado.' })
    } catch (error) {
      setMessage({ error: true, text: error instanceof BackupError ? error.message : 'No se pudo importar.' })
    } finally {
      setPending(null)
    }
  }

  if (lastBackupAt === undefined) return null
  const last = describeLastBackup(lastBackupAt)
  const summary = pending && summarizeBackup(pending)

  return (
    <Card
      embedded={embedded}
      headingId={headingId}
      label="Respaldo"
      icon={DatabaseBackup}
      action={<Badge tone={last.stale ? 'ember' : 'signal'}>Último: {last.text}</Badge>}
    >
      <p className="mb-3 text-sm text-muted">
        Tus datos solo viven en este teléfono. Si desinstalas la app sin respaldo, se pierden.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void exportBackup()}>
          <Download aria-hidden />
          Exportar
        </Button>
        <Button onClick={() => fileInput.current?.click()}>
          <Upload aria-hidden />
          Importar
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void readFile(event)}
          className="hidden"
        />
      </div>

      {pending && summary && (
        <div ref={confirmation} className="mt-4 rounded-xl border border-ember/60 bg-ember/10 p-3 text-sm">
          <p className="mb-1 font-semibold text-ember">¿Reemplazar todos tus datos?</p>
          <p className="mb-3 text-muted">
            Respaldo del {formatDate(summary.exportedAt)}: {summary.bounties} contratos activos,{' '}
            {summary.campaigns} campañas, {summary.sideQuests} Side Quests y {summary.totalXp} XP. Tu progreso
            actual se borrará.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setPending(null)} className="flex-1">
              Cancelar
            </Button>
            <Button size="sm" variant="danger" onClick={() => void importBackup(pending)} className="flex-1">
              Reemplazar mis datos
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.error ? 'text-ember' : 'text-signal'}`}>
          {message.text}
        </p>
      )}
    </Card>
  )
}
