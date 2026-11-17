// Ruta progresiva de hábitos: instrucciones, esquema, validación y la llamada que la diseña.
import { z } from 'zod'
import type { HabitFrequency } from '../../data/db'
import type { RoutePlanItem } from '../../data/gameStore'
import type { HttpRequest } from '../../platform/http'
import { principlesPrompt } from '../../game/library'
import { principle } from './validation'
import { callJson, validated, type Resilience } from './resilience'
import type { ThinkingLevel } from './types'

export const ROUTE_PROMPT = `Eres el entrenador de hábitos de Real Life RPG, una app que convierte metas reales en un juego de rol.
El jugador te da la lista de hábitos que quiere tener. No conviene empezar todos de golpe: tu trabajo es diseñar una RUTA para introducirlos poco a poco.

Devuelve:
- intro: 1 o 2 frases que expliquen la ruta, en tono motivador pero honesto. No prometas un número mágico de días.
- habits: los mismos hábitos que pidió (puedes unir duplicados o partir uno demasiado grande), ORDENADOS: primero los de más impacto y más fáciles de sostener, después los que se apoyan en los primeros.
Para cada hábito:
- title: nombre corto del hábito (2 a 4 palabras), por ejemplo "Lectura".
- emoji: un emoji que lo represente.
- why: una frase con por qué importa y en qué ayuda.
- levels: de 2 a 4 niveles, del más fácil al más exigente. El primero es la VERSIÓN MÍNIMA, tan pequeña que sea casi imposible fallar (por ejemplo "Leer 2 páginas", "Hacer 5 sentadillas", "Meditar 2 minutos"). Cada nivel es una frase corta que empieza con un verbo y dice cantidades o tiempos. Ejemplo: "Leer 2 páginas" → "Leer 10 páginas" → "Leer 30 minutos".
- frequency: la frecuencia sugerida. kind "daily" (todos los días), "weekdays" (days: lista de 0 = lunes a 6 = domingo) o "timesPerWeek" (times: de 1 a 6). Usa "timesPerWeek" para cosas como el ejercicio intenso, que no conviene diario.
Respeta el contexto del jugador (horarios, nivel actual).

${principlesPrompt('route')}

Todo en español. No inventes datos personales.`

const text = { type: 'string' }

export const ROUTE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intro: text,
    habits: {
      type: 'array',
      minItems: 1,
      maxItems: 15,
      items: {
        type: 'object',
        properties: {
          title: text,
          emoji: text,
          why: text,
          levels: { type: 'array', items: text, minItems: 2, maxItems: 4 },
          frequency: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['daily', 'weekdays', 'timesPerWeek'] },
              days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
              times: { type: 'integer', minimum: 1, maximum: 6 },
            },
            required: ['kind'],
          },
          principle: text,
        },
        required: ['title', 'emoji', 'why', 'levels', 'frequency', 'principle'],
      },
    },
  },
  required: ['intro', 'habits'],
}

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max))

const frequency = z
  .object({
    kind: z.enum(['daily', 'weekdays', 'timesPerWeek']).catch('daily'),
    days: z.array(z.coerce.number()).optional(),
    times: z.coerce.number().optional(),
  })
  .transform((value): HabitFrequency => {
    if (value.kind === 'timesPerWeek') {
      return { kind: 'timesPerWeek', times: Math.min(6, Math.max(1, Math.round(value.times ?? 3))) }
    }
    const days = [...new Set((value.days ?? []).map(Math.round).filter((day) => day >= 0 && day <= 6))].sort()
    return value.kind === 'weekdays' && days.length > 0 && days.length < 7
      ? { kind: 'weekdays', days }
      : { kind: 'daily' }
  })
  .catch({ kind: 'daily' })

export const routeSchema = z.object({
  intro: clipped(400).default(''),
  habits: z
    .array(
      z.object({
        title: clipped(60).pipe(z.string().min(1)),
        emoji: clipped(8).default(''),
        why: clipped(300).default(''),
        levels: z
          .array(clipped(120))
          .transform((list) => list.filter(Boolean).slice(0, 4))
          .pipe(z.array(z.string()).min(1)),
        frequency,
        principle,
      }),
    )
    .min(1)
    .transform((list) => list.slice(0, 15)),
})

export type RoutePlan = { intro: string; habits: RoutePlanItem[] }

/** Diseña la ruta a partir de los hábitos que quiere el jugador. */
export async function generateHabitRoute(
  request: HttpRequest,
  options: Resilience & { apiKey: string; model: string; thinking?: ThinkingLevel; wishes: string; context: string },
): Promise<RoutePlan> {
  const { wishes, context, onStatus, fallbackModel, retry, ...call } = options
  const json = await callJson(request, {
    ...call,
    onStatus,
    fallbackModel,
    retry,
    system: ROUTE_PROMPT,
    input: [
      `Hábitos que quiere tener:\n${wishes.trim().slice(0, 3000)}`,
      context.trim() ? `Contexto: ${context.trim().slice(0, 1000)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    schema: ROUTE_JSON_SCHEMA,
    temperature: 0.6,
  })
  const plan = validated(routeSchema, json)
  return {
    intro: plan.intro,
    habits: plan.habits.map(({ emoji, ...item }) => ({
      ...item,
      ...(emoji ? { emoji: [...emoji].slice(0, 2).join('') } : {}),
    })),
  }
}
