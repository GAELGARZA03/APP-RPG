// Paso 1 del generador: escribir la meta.
import { motion } from 'motion/react'
import { MAX_IDEA_LENGTH } from '../../ai/gemini'
import { Button } from '../kit/Button'
import { Field, Textarea } from '../kit/controls'

const IDEA_EXAMPLES = [
  'Aprender magia con cartas',
  'Correr 5 km sin parar',
  'Publicar mi app en Android',
  'Leer 12 libros este año',
]

export function IdeaStep(props: {
  idea: string
  onIdeaChange: (idea: string) => void
  /** Título del borrador anterior, si existe, para volver a su vista previa. */
  draftTitle: string | null
  onBackToPreview: () => void
  onCancel: () => void
  onNext: () => void
}) {
  const { idea, onIdeaChange } = props
  return (
    <>
      <Field
        label="Escribe tu meta o pega una conversación"
        hint={
          <span className="flex justify-between gap-2">
            <span>
              Tu texto y tus respuestas se envían a Google Gemini. En el nivel gratuito, Google puede usarlos para
              mejorar sus productos.
            </span>
            <span className="shrink-0 tabular-nums">
              {idea.length}/{MAX_IDEA_LENGTH}
            </span>
          </span>
        }
      >
        <Textarea
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          maxLength={MAX_IDEA_LENGTH}
          rows={5}
          placeholder="Quiero aprender a tocar guitarra"
        />
      </Field>
      {idea.trim() === '' && (
        <div className="-mt-1 flex flex-wrap gap-2" aria-label="Ejemplos">
          {IDEA_EXAMPLES.map((example) => (
            <motion.button
              key={example}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onIdeaChange(example)}
              className="min-h-11 rounded-full border border-white/[0.08] bg-void/50 px-3.5 text-sm text-muted active:border-signal active:text-signal"
            >
              {example}
            </motion.button>
          ))}
        </div>
      )}
      {props.draftTitle !== null && (
        <Button variant="outline" onClick={props.onBackToPreview}>
          Volver a la vista previa de «{props.draftTitle}»
        </Button>
      )}
      <div className="flex gap-2">
        <Button onClick={props.onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button variant="primary" onClick={props.onNext} disabled={!idea.trim()} className="flex-1">
          Siguiente
        </Button>
      </div>
    </>
  )
}
