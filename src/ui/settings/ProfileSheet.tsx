import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Trash2 } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../../data/appDb'
import { getProfile, saveProfile } from '../../data/settings'
import { Avatar, imageFileToAvatar } from '../kit/Avatar'
import { Button } from '../kit/Button'
import { Field, Input } from '../kit/controls'
import { Sheet, SheetTitle } from '../Sheet'

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const headingId = useId()
  const profile = useLiveQuery(() => getProfile(db), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      await saveProfile(db, { photo: await imageFileToAvatar(file) })
    } catch {
      setError('No se pudo usar esa imagen. Prueba con otra foto.')
    }
  }

  async function save() {
    if (name !== null) await saveProfile(db, { name: name.trim().slice(0, 40) })
    onClose()
  }

  if (!profile) return null
  const currentName = name ?? profile.name

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      <div className="flex flex-col gap-5">
        <SheetTitle id={headingId}>Tu perfil</SheetTitle>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Cambiar foto de perfil"
            className="relative rounded-full active:scale-95"
          >
            <Avatar photo={profile.photo} name={currentName} size="lg" />
            <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-2 border-panel bg-signal text-on-signal">
              <Camera aria-hidden className="size-4" />
            </span>
          </button>
          <input ref={fileInput} type="file" accept="image/*" onChange={(event) => void choosePhoto(event)} className="hidden" />
          {profile.photo && (
            <Button variant="ghost" size="sm" onClick={() => void saveProfile(db, { photo: null })}>
              <Trash2 aria-hidden />
              Quitar foto
            </Button>
          )}
          {error && <p className="text-sm text-ember">{error}</p>}
        </div>

        <Field label="Nombre de jugador">
          <Input
            value={currentName}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Tu nombre o apodo"
            enterKeyHint="done"
          />
        </Field>

        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void save()} className="flex-1">
            Guardar
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
