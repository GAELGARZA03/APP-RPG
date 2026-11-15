// Paso 2 del generador: responder las preguntas previas (todas opcionales).
import { ArrowLeft, Sparkles } from 'lucide-react'
import type { Question } from '../../ai/gemini'
import { Button } from '../kit/Button'
import { QuestionCard } from './QuestionCard'

export function QuestionsStep(props: {
  questions: Question[]
  answers: Record<number, string>
  onAnswersChange: (answers: Record<number, string>) => void
  hasDraft: boolean
  onBackToPreview: () => void
  onBack: () => void
  onDesign: () => void
}) {
  const { questions, answers } = props
  const answeredCount = Object.values(answers).filter((answer) => answer.trim()).length
  return (
    <>
      <p className="text-sm text-muted">
        Responde lo que quieras: con esto la campaña se ajusta a tu nivel y a tu tiempo. Puedes saltarte cualquiera.
      </p>
      {questions.map((question, index) => (
        <QuestionCard
          key={question.question}
          question={question}
          answer={answers[index] ?? ''}
          onAnswer={(answer) => props.onAnswersChange({ ...answers, [index]: answer })}
        />
      ))}
      {props.hasDraft && (
        <Button variant="outline" onClick={props.onBackToPreview}>
          Volver a la vista previa
        </Button>
      )}
      <div className="flex gap-2">
        <Button onClick={props.onBack} aria-label="Volver a la meta" size="icon" className="shrink-0">
          <ArrowLeft aria-hidden />
        </Button>
        <Button variant="primary" onClick={props.onDesign} className="flex-1">
          <Sparkles aria-hidden />
          {answeredCount === 0 ? 'Saltar y diseñar' : 'Diseñar campaña'}
        </Button>
      </div>
    </>
  )
}
