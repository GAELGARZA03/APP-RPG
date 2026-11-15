// Diario de la bitácora como libreta: arriba la página del día (texto y foto) y abajo el calendario del mes.
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Check, ChevronLeft, ChevronRight, ImagePlus, NotebookPen, Pencil } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../data/appDb'
import type { DailyNote } from '../data/db'
import { getDiaryMonth, MAX_DAILY_NOTE_LENGTH, saveDailyNote } from '../data/gameStore'
import { addDays, weekdayOf, type GameDay } from '../game/gameDay'
import { haptic } from '../platform/haptics'
import { PhotoViewer } from './EvidenceSection'
import { imageFileToEvidence } from './images'
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

export function Diary({ today }: { today: GameDay }) {
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
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
  const [viewing, setViewing] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [, month, date] = day.split('-').map(Number)
  const isToday = day === today
  const weekday = WEEKDAYS[weekdayOf(day)]

  useEffect(() => setText(note?.text ?? ''), [note?.text])

  async function saveText() {
    await saveDailyNote(db, day, { text })
    haptic('complete')
    setEditing(false)
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      await saveDailyNote(db, day, {
        text: editing ? text : (note?.text ?? ''),
        photo: await imageFileToEvidence(file),
      })
      haptic('complete')
    } catch {
      setError('No se pudo usar esa imagen. Prueba con otra foto.')
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
              {!text.trim() && note && !note.photo ? 'Borrar nota' : 'Guardar'}
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

      {note?.photo && (
        <motion.button
          type="button"
          onClick={() => setViewing(true)}
          aria-label="Ver foto del día"
          initial={{ rotate: 0, opacity: 0 }}
          animate={{ rotate: -2, opacity: 1 }}
          className="mt-3 block w-full max-w-64 rounded-md bg-white p-1.5 pb-5 shadow-lg shadow-black/40"
        >
          <img src={note.photo} alt="" className="aspect-[4/3] w-full rounded-sm object-cover" />
        </motion.button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => camera.current?.click()}>
          <Camera aria-hidden />
          {note?.photo ? 'Cambiar foto' : 'Tomar foto'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => gallery.current?.click()}>
          <ImagePlus aria-hidden />
          Galería
        </Button>
      </div>
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
        onChange={(event) => void choosePhoto(event)}
        className="hidden"
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        onChange={(event) => void choosePhoto(event)}
        className="hidden"
      />

      <AnimatePresence>
        {viewing && note?.photo && (
          <PhotoViewer
            photo={note.photo}
            onClose={() => setViewing(false)}
            onDelete={() => {
              void saveDailyNote(db, day, { text: note.text, photo: null })
              setViewing(false)
            }}
          />
        )}
      </AnimatePresence>
    </section>
  )
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
              {note?.photo && (
                <img src={note.photo} alt="" className="absolute inset-0 size-full object-cover opacity-80" />
              )}
              <span
                className={cn(
                  'relative',
                  note?.photo && 'rounded bg-black/55 px-1 text-white',
                  day === today && !note?.photo && 'text-signal',
                )}
              >
                {Number(day.slice(8))}
              </span>
              {note && !note.photo && (
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
