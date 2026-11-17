// Diario de la bitácora como libreta: arriba la página del día (texto, fotos y videos) y abajo el calendario del mes.
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  LoaderCircle,
  NotebookPen,
  Pencil,
  Video,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../data/appDb'
import type { DailyNote, VideoRef } from '../data/db'
import {
  addDiaryMedia,
  getDiaryMonth,
  MAX_DAILY_NOTE_LENGTH,
  MAX_DIARY_PHOTOS,
  MAX_VIDEOS,
  removeDiaryPhoto,
  removeDiaryVideo,
  saveDailyNote,
} from '../data/gameStore'
import { addDays, weekdayOf, type GameDay } from '../game/gameDay'
import { haptic } from '../platform/haptics'
import { PhotoViewer } from './EvidenceSection'
import { VideoThumb, VideoViewer } from './media/MediaTiles'
import { isVideoFile, readMediaFiles } from './media/readMedia'
import { Button } from './kit/Button'
import { cn } from './kit/cn'

const PROMPT =
  '¿Qué hiciste hoy que valga la pena recordar? Algo épico, algo que te pasó o algo por lo que das gracias.'
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
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function shiftMonth(month: string, amount: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function Diary({ today, initialDay }: { today: GameDay; initialDay?: GameDay }) {
  const [selected, setSelected] = useState(initialDay ?? today)
  const [month, setMonth] = useState((initialDay ?? today).slice(0, 7))
  const notes = useLiveQuery(() => getDiaryMonth(db, month), [month])
  const selectedNotes = useLiveQuery(() => getDiaryMonth(db, selected.slice(0, 7)), [selected])
  const page = useRef<HTMLDivElement>(null)

  function select(day: GameDay) {
    setSelected(day)
    page.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  if (!notes || !selectedNotes) return null
  return (
    <div className="flex flex-col gap-4">
      <div ref={page} className="scroll-mt-4">
        <DiaryPage
          key={selected}
          day={selected}
          today={today}
          note={selectedNotes.get(selected) ?? null}
          onBackToToday={selected === today ? undefined : () => select(today)}
        />
      </div>
      <DiaryCalendar
        month={month}
        notes={notes}
        selected={selected}
        today={today}
        onSelect={select}
        onMonth={(amount) => setMonth(shiftMonth(month, amount))}
      />
    </div>
  )
}

/** Una página de libreta: la fecha arriba, renglones, el texto y la foto pegada. */
function DiaryPage(props: { day: GameDay; today: GameDay; note: DailyNote | null; onBackToToday?: () => void }) {
  const { day, today, note } = props
  const [editing, setEditing] = useState(note === null && day === today)
  const [text, setText] = useState(note?.text ?? '')
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<{ photo: number } | { video: VideoRef } | null>(null)
  const [busy, setBusy] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const videoCamera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const photos = note?.photos ?? []
  const videos = note?.videos ?? []
  const photoRoom = MAX_DIARY_PHOTOS - photos.length
  const videoRoom = MAX_VIDEOS - videos.length
  const mediaCount = photos.length + videos.length
  const [, month, date] = day.split('-').map(Number)
  const isToday = day === today
  const weekday = WEEKDAYS[weekdayOf(day)]

  useEffect(() => setText(note?.text ?? ''), [note?.text])

  async function saveText() {
    await saveDailyNote(db, day, { text })
    haptic('complete')
    setEditing(false)
  }

  /** Agrega lo elegido (una o varias fotos y videos) hasta los límites del día. */
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
      messages.push(`Por día caben ${MAX_DIARY_PHOTOS} fotos y ${MAX_VIDEOS} videos.`)
    }
    setBusy(true)
    try {
      const { items, errors } = await readMediaFiles(accepted)
      messages.unshift(...errors)
      if (items.length > 0) {
        const { added } = await addDiaryMedia(db, day, items, editing ? text : undefined)
        if (added > 0) haptic('complete')
      }
    } catch {
      messages.unshift('No se pudo guardar. Prueba otra vez.')
    } finally {
      setBusy(false)
      setError(messages.length > 0 ? messages.join(' ') : null)
    }
  }

  return (
    <section
      aria-label={isToday ? 'Página de hoy' : `Página del ${date} de ${MONTHS[month - 1]}`}
      className="notebook-page relative overflow-hidden rounded-3xl border border-white/[0.08] py-4 pr-4 pl-12"
    >
      <header className="mb-1 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-info uppercase">
            <NotebookPen aria-hidden className="size-3.5" />
            {isToday ? 'Nota de hoy' : capitalize(weekday)}
          </p>
          <h2 className="font-display text-2xl leading-7 font-semibold">
            {isToday ? `${capitalize(weekday)} ` : ''}
            {date} de {MONTHS[month - 1]}
          </h2>
        </div>
        {props.onBackToToday && (
          <Button size="sm" variant="ghost" onClick={props.onBackToToday} className="-mr-2">
            Ir a hoy
          </Button>
        )}
      </header>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_DAILY_NOTE_LENGTH}
            rows={4}
            placeholder={isToday ? PROMPT : '¿Qué pasó este día?'}
            aria-label="Nota del día"
            className="w-full resize-none bg-transparent text-[15px] leading-7 text-ink outline-none placeholder:text-muted/70"
          />
          <div className="flex items-center justify-end gap-2">
            {note && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={!text.trim() && !note} onClick={() => void saveText()}>
              <Check aria-hidden />
              {!text.trim() && note && mediaCount === 0 ? 'Borrar nota' : 'Guardar'}
            </Button>
          </div>
        </div>
      ) : note?.text ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Editar nota"
          className="block w-full text-left text-[15px] leading-7 whitespace-pre-wrap"
        >
          {note.text}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-14 w-full items-center gap-2 text-left text-[15px] leading-7 text-muted"
        >
          <Pencil aria-hidden className="size-4" />
          {isToday ? 'Escribe tu nota de hoy' : 'Escribir algo de este día'}
        </button>
      )}

      {mediaCount === 1 && photos.length === 1 ? (
        <motion.button
          type="button"
          onClick={() => setViewing({ photo: 0 })}
          aria-label="Ver foto del día"
          initial={{ rotate: 0, opacity: 0 }}
          animate={{ rotate: -2, opacity: 1 }}
          className="mt-3 block w-full max-w-64 rounded-md bg-white p-1.5 pb-5 shadow-lg shadow-black/40"
        >
          <img src={photos[0]} alt="" className="aspect-[4/3] w-full rounded-sm object-cover" />
        </motion.button>
      ) : (
        mediaCount > 0 && (
          <ul aria-label="Fotos y videos del día" className="mt-3 grid grid-cols-3 gap-2.5 pr-1">
            {photos.map((photo, index) => (
              <li key={`${index}-${photo.length}`}>
                <motion.button
                  type="button"
                  onClick={() => setViewing({ photo: index })}
                  aria-label={`Ver foto ${index + 1}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, rotate: index % 2 === 0 ? -2 : 2 }}
                  className="block w-full rounded-md bg-white p-1 pb-3 shadow-lg shadow-black/40"
                >
                  <img src={photo} alt="" className="aspect-square w-full rounded-sm object-cover" />
                </motion.button>
              </li>
            ))}
            {videos.map((video, index) => (
              <li key={video.id}>
                <motion.button
                  type="button"
                  onClick={() => setViewing({ video })}
                  aria-label={`Ver video ${index + 1}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, rotate: (photos.length + index) % 2 === 0 ? -2 : 2 }}
                  className="block w-full rounded-md bg-white p-1 pb-3 shadow-lg shadow-black/40"
                >
                  <span className="block aspect-square w-full overflow-hidden rounded-sm">
                    <VideoThumb video={video} />
                  </span>
                </motion.button>
              </li>
            ))}
          </ul>
        )
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || photoRoom <= 0} onClick={() => camera.current?.click()}>
          <Camera aria-hidden />
          Foto
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || videoRoom <= 0}
          onClick={() => videoCamera.current?.click()}
        >
          <Video aria-hidden />
          Video
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || (photoRoom <= 0 && videoRoom <= 0)}
          onClick={() => gallery.current?.click()}
        >
          {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <ImagePlus aria-hidden />}
          {busy ? 'Guardando…' : 'Galería'}
        </Button>
      </div>
      {mediaCount > 0 && (
        <p className="mt-1.5 text-[11px] text-muted">
          {photos.length} de {MAX_DIARY_PHOTOS} fotos · {videos.length} de {MAX_VIDEOS} videos (máximo 1 minuto cada
          uno)
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-ember">
          {error}
        </p>
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

      <AnimatePresence>
        {viewing && 'photo' in viewing && photos[viewing.photo] && (
          <PhotoViewer
            photo={photos[viewing.photo]}
            onClose={() => setViewing(null)}
            onDelete={() => {
              void removeDiaryPhoto(db, day, viewing.photo)
              setViewing(null)
            }}
          />
        )}
        {viewing && 'video' in viewing && (
          <VideoViewer
            video={viewing.video}
            onClose={() => setViewing(null)}
            onDelete={() => {
              void removeDiaryVideo(db, day, viewing.video.id)
              setViewing(null)
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/** Fotos de un día para el calendario: sus fotos y las miniaturas de sus videos. */
function coversOf(note: DailyNote | undefined): string[] {
  if (!note) return []
  return [...(note.photos ?? []), ...(note.videos ?? []).flatMap((video) => (video.poster ? [video.poster] : []))]
}

/** Calendario del mes: cada día con nota lleva su foto o una marca de tinta; tocarlo abre su página. */
function DiaryCalendar(props: {
  month: string
  notes: Map<GameDay, DailyNote>
  selected: GameDay
  today: GameDay
  onSelect: (day: GameDay) => void
  onMonth: (amount: -1 | 1) => void
}) {
  const { month, notes, selected, today } = props
  const first = `${month}-01`
  const [year, number] = month.split('-').map(Number)
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const blanks = weekdayOf(first)
  const days = Array.from({ length }, (_, index) => addDays(first, index))
  const written = days.filter((day) => notes.has(day)).length
  // Los días con varias fotos (o videos) van cambiando de foto cada pocos segundos, cada uno a su ritmo.
  const [tick, setTick] = useState(0)
  const rotating = days.some((day) => coversOf(notes.get(day)).length > 1)
  useEffect(() => {
    if (!rotating) return
    const timer = setInterval(() => setTick((value) => value + 1), 3500)
    return () => clearInterval(timer)
  }, [rotating])

  return (
    <section aria-label="Calendario del diario" className="notebook-paper rounded-3xl border border-white/[0.08] p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => props.onMonth(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <div className="text-center">
          <p className="font-display text-base font-semibold">
            {capitalize(MONTHS[number - 1])} {year}
          </p>
          <p className="text-[11px] text-muted">
            {written} {written === 1 ? 'día escrito' : 'días escritos'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mes siguiente"
          disabled={month >= today.slice(0, 7)}
          onClick={() => props.onMonth(1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </header>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LETTERS.map((letter) => (
          <span key={letter} aria-hidden className="pb-1 text-[10px] text-muted">
            {letter}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`vacío-${index}`} />
        ))}
        {days.map((day) => {
          const note = notes.get(day)
          const covers = coversOf(note)
          const cover = covers.length > 0 ? covers[(tick + Number(day.slice(8))) % covers.length] : undefined
          const future = day > today
          return (
            <button
              key={day}
              type="button"
              disabled={future}
              onClick={() => props.onSelect(day)}
              aria-label={`${Number(day.slice(8))} de ${MONTHS[number - 1]}${note ? ', con nota' : ''}`}
              aria-pressed={day === selected}
              className={cn(
                'relative grid aspect-square place-items-center overflow-hidden rounded-lg border text-xs font-semibold tabular-nums transition-colors',
                day === selected ? 'border-info ring-2 ring-info/50' : 'border-white/[0.06]',
                day === today && day !== selected && 'border-signal',
                future ? 'text-muted/40' : 'bg-void/40 active:bg-raised',
              )}
            >
              {cover && (
                <motion.img
                  key={cover.slice(-40)}
                  src={cover}
                  alt=""
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.8 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              <span
                className={cn(
                  'relative',
                  cover && 'rounded bg-black/55 px-1 text-white',
                  day === today && !cover && 'text-signal',
                )}
              >
                {Number(day.slice(8))}
              </span>
              {note && !cover && (
                <span
                  aria-hidden
                  className="absolute bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-info"
                />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
