// Una pregunta previa con respuestas tocables.
import type { Question } from '../../ai/gemini'
import { cn } from '../kit/cn'
import { Input } from '../kit/controls'
import { motion } from 'motion/react'
import { useState } from 'react'

export function QuestionCard(props: { question: Question; answer: string; onAnswer: (answer: string) => void }) {
  const { question, answer, onAnswer } = props
  const custom = answer !== '' && !question.options.includes(answer)
  const [writing, setWriting] = useState(custom)

  return (
    <fieldset className="rounded-2xl border border-white/[0.06] bg-void/50 p-3">
      <legend className="float-left mb-2.5 w-full text-[15px] leading-snug font-medium">{question.question}</legend>
      <div className="clear-both flex flex-wrap gap-2">
        {question.options.map((option) => {
          const selected = !writing && answer === option
          return (
            <motion.button
              key={option}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={selected}
              onClick={() => {
                setWriting(false)
                onAnswer(selected ? '' : option)
              }}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm transition-colors',
                selected ? 'border-signal bg-signal/15 font-medium text-signal' : 'border-white/[0.08] text-ink/90',
              )}
            >
              {option}
            </motion.button>
          )
        })}
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          aria-pressed={writing}
          onClick={() => {
            setWriting((value) => !value)
            onAnswer('')
          }}
          className={cn(
            'min-h-11 rounded-full border border-dashed px-4 text-sm transition-colors',
            writing ? 'border-signal text-signal' : 'border-white/15 text-muted',
          )}
        >
          Otra…
        </motion.button>
      </div>
      {writing && (
        <Input
          value={answer}
          onChange={(event) => onAnswer(event.target.value)}
          maxLength={120}
          autoFocus
          placeholder="Escribe tu respuesta"
          aria-label={`Tu respuesta a: ${question.question}`}
          className="mt-2.5 text-sm"
        />
      )}
    </fieldset>
  )
}
