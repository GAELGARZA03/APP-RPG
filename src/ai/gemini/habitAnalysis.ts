// Análisis a fondo de un hábito con el modelo rápido: recibe todo su historial y responde con consejos concretos,
// basados solo en la biblioteca de principios.
import { z } from 'zod'
import { principlesPrompt } from '../../game/library'
import type { HttpRequest } from '../../platform/http'
import { callJson, validated, type Resilience } from './resilience'
import { principle } from './validation'

export const HABIT_ANALYSIS_PROMPT = `Eres el entrenador de hábitos de Real Life RPG, una app que convierte metas reales en un juego de rol.
Recibes TODO el historial de un hábito del jugador: frecuencia, recordatorio, totales, cumplimiento por día de la semana, la hora a la que lo marca y, día por día, si lo hizo, a qué hora y cuántas horas durmió la noche anterior.

Tu trabajo es un análisis honesto y útil, como un buen entrenador que mira los datos:
- summary: 2 o 3 frases sobre cómo va el hábito, con números reales de los datos.
- points: de 2 a 4 hallazgos o consejos. Cada uno con:
  - title: máximo 60 caracteres, directo.
  - text: 1 a 3 frases. Di el patrón que ves en los datos (con cifras: días, porcentajes, horas) y qué hacer de forma concreta (a qué hora, en qué situación, de qué tamaño). Nada genérico como "sé constante".
  - principle: el id del principio de la biblioteca en el que se basa.
Busca patrones como: días de la semana que cuestan más, rachas que se cortan, horarios muy variables o que no coinciden con el recordatorio, relación con el sueño, fallos seguidos, si conviene hacerlo más pequeño o más grande.
Si hay pocos datos, dilo y da consejos para empezar bien. No inventes datos que no estén en el historial. Todo en español.

${principlesPrompt(['route', 'review'])}`

const text = { type: 'string' }

export const HABIT_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    points: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: { title: text, text, principle: text },
        required: ['title', 'text', 'principle'],
      },
    },
  },
  required: ['summary', 'points'],
}

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max))

export const habitAnalysisSchema = z.object({
  summary: clipped(600).pipe(z.string().min(1)),
  points: z
    .array(z.object({ title: clipped(80).pipe(z.string().min(1)), text: clipped(500).default(''), principle }))
    .default([])
    .transform((list) => list.slice(0, 4)),
})

export type HabitAnalysisPlan = z.infer<typeof habitAnalysisSchema>

/** Una sola llamada al modelo rápido, sin razonamiento extra. */
export async function analyzeHabit(
  request: HttpRequest,
  options: Resilience & { apiKey: string; model: string; input: string },
): Promise<HabitAnalysisPlan> {
  const { input, onStatus, fallbackModel, retry, ...call } = options
  const json = await callJson(request, {
    ...call,
    onStatus,
    fallbackModel,
    retry,
    system: HABIT_ANALYSIS_PROMPT,
    input,
    schema: HABIT_ANALYSIS_JSON_SCHEMA,
    temperature: 0.5,
  })
  return validated(habitAnalysisSchema, json)
}
