import { Camera, ImagePlus, LoaderCircle, NotebookPen, Trash2, Video, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../data/appDb'
import type { Evidence } from '../data/db'
import {
  addEvidence,
  deleteEvidence,
  MAX_NOTE_LENGTH,
  MAX_PHOTOS_PER_TASK,
  MAX_VIDEOS,
  type TaskRef,
} from '../data/gameStore'
import { useBack } from './backStack'
import { VideoThumb, VideoViewer } from './media/MediaTiles'
import { isVideoFile, readMediaFiles } from './media/readMedia'
import { Button } from './kit/Button'
import { SectionLabel } from './kit/Card'
import { Textarea } from './kit/controls'

/** Foto a pantalla completa. Se cierra al tocarla o con el botón atrás. */
export function PhotoViewer({
  photo,
  onClose,
  onDelete,
}: {
  photo: string
  onClose: () => void
  onDelete?: () => void
}) {
  useBack(true, onClose)
  const close = useRef<HTMLButtonElement>(null)

  // El foco entra al visor para que los lectores de pantalla lo anuncien en lugar de lo que queda debajo.
  useEffect(() => {
    close.current?.focus()
  }, [])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Foto de evidencia"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex justify-between p-2">
        {onDelete ? (
          <Button variant="ghost" size="icon" aria-label="Borrar foto" onClick={onDelete}>
            <Trash2 aria-hidden />
          </Button>
        ) : (
          <span />
        )}
        <Button ref={close} variant="ghost" size="icon" aria-label="Cerrar foto" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <button type="button" onClick={onClose} className="min-h-0 flex-1 p-2" aria-label="Cerrar foto">
        <img src={photo} alt="Evidencia" className="size-full object-contain" />
      </button>
    </motion.div>
  )
}

/** Fotos y notas de una misión: se agregan al completarla o después. */
export function EvidenceSection(props: {
  taskRef: TaskRef
  evidence: Evidence[]
  /** La misión jefe no se completa sin al menos una foto o una nota. */
  required: boolean
  onAdded?: () => void
}) {
  const { taskRef, evidence, required, onAdded } = props
  const camera = useRef<HTMLInputElement>(null)
  const videoCamera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [writing, setWriting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Evidence | null>(null)
  const photos = evidence.filter((item) => item.photo)
  const videos = evidence.filter((item) => item.video)
  const media = evidence.filter((item) => item.photo || item.video)
  const notes = evidence.filter((item) => item.note)
  const photoRoom = MAX_PHOTOS_PER_TASK - photos.length
  const videoRoom = MAX_VIDEOS - videos.length

  /** Agrega lo elegido (una o varias fotos y videos) hasta los límites de la misión. */
  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return
    setError(null)
    let photosLeft = photoRoom
    let videosLeft = videoRoom
    const accepted = files.filter((file) => (isVideoFile(file) ? videosLeft-- > 0 : photosLeft-- > 0))
    const messages: string[] = []
    if (accepted.length < files.length) {
      messages.push(`Por misión caben ${MAX_PHOTOS_PER_TASK} fotos y ${MAX_VIDEOS} videos.`)
    }
    setBusy(true)
    let added = 0
    try {
      const { items, errors } = await readMediaFiles(accepted)
      messages.unshift(...errors)
      for (const item of items) if (await addEvidence(db, taskRef, item)) added += 1
    } catch {
      messages.unshift('No se pudo guardar. Prueba otra vez.')
    } finally {
      setBusy(false)
      setError(messages.length > 0 ? messages.join(' ') : null)
      if (added > 0) onAdded?.()
    }
  }

  async function saveNote() {
    if (!note.trim()) return
    const added = await addEvidence(db, taskRef, { note })
    if (!added) {
      setError('Ya no caben más notas en esta misión.')
      return
    }
    setNote('')
    setWriting(false)
    onAdded?.()
  }

  return (
    <section aria-label="Bitácora de la misión" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel icon={NotebookPen}>Bitácora</SectionLabel>
        {required && evidence.length === 0 && (
          <span className="rounded-full bg-ember/15 px-2 py-0.5 text-[11px] font-semibold text-ember">
            El jefe pide evidencia
          </span>
        )}
      </div>

      {media.length > 0 && (
        <ul className="grid grid-cols-4 gap-2">
          {media.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setViewing(item)}
                aria-label={item.video ? 'Ver video' : 'Ver foto'}
                className="block aspect-square w-full overflow-hidden rounded-xl ring-1 ring-white/10 active:scale-95"
              >
                {item.video ? (
                  <VideoThumb video={item.video} />
                ) : (
                  <img src={item.photo} alt="" className="size-full object-cover" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {notes.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-2 rounded-2xl border border-white/[0.06] bg-void/50 p-3 text-sm leading-snug"
        >
          <p className="min-w-0 flex-1 whitespace-pre-wrap">{item.note}</p>
          <button
            type="button"
            aria-label="Borrar nota"
            onClick={() => void deleteEvidence(db, item.id)}
            className="-m-2 grid size-11 shrink-0 place-items-center text-muted active:text-ember"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      ))}

      {writing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={3}
            autoFocus
            aria-label="Nota"
            placeholder="¿Cómo te fue? ¿Qué aprendiste?"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setWriting(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!note.trim()}
              onClick={() => void saveNote()}
              className="flex-1"
            >
              Guardar nota
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Button
            size="sm"
            disabled={busy || photoRoom <= 0}
            onClick={() => camera.current?.click()}
            className="min-h-11 px-1"
          >
            <Camera aria-hidden />
            Foto
          </Button>
          <Button
            size="sm"
            disabled={busy || videoRoom <= 0}
            onClick={() => videoCamera.current?.click()}
            className="min-h-11 px-1"
          >
            <Video aria-hidden />
            Video
          </Button>
          <Button
            size="sm"
            disabled={busy || (photoRoom <= 0 && videoRoom <= 0)}
            onClick={() => gallery.current?.click()}
            className="min-h-11 px-1"
          >
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <ImagePlus aria-hidden />}
            Galería
          </Button>
          <Button size="sm" onClick={() => setWriting(true)} className="min-h-11 px-1">
            <NotebookPen aria-hidden />
            Nota
          </Button>
        </div>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => void addFiles(event)}
        className="hidden"
      />
      <input
        ref={videoCamera}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={(event) => void addFiles(event)}
        className="hidden"
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={(event) => void addFiles(event)}
        className="hidden"
      />
      {error && (
        <p role="alert" className="text-sm text-ember">
          {error}
        </p>
      )}

      <AnimatePresence>
        {viewing?.photo && (
          <PhotoViewer
            photo={viewing.photo}
            onClose={() => setViewing(null)}
            onDelete={() => {
              void deleteEvidence(db, viewing.id)
              setViewing(null)
            }}
          />
        )}
        {viewing?.video && (
          <VideoViewer
            video={viewing.video}
            onClose={() => setViewing(null)}
            onDelete={() => {
              void deleteEvidence(db, viewing.id)
              setViewing(null)
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
