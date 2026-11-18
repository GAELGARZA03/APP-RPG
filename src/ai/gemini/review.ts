// Revisión semanal: instrucciones, esquema, validación y la llamada que la genera.
import { z } from 'zod'
import type { Difficulty } from '../../game/rules'
import type { ReviewPlan, WeekReport } from '../../data/gameStore'
import type { HttpRequest } from '../../platform/http'
import { principlesPrompt } from '../../game/library'
import { principle } from './validation'
import { callJson, validated, type Resilience } from './resilience'
import type { ThinkingLevel } from './types'

export const REVIEW_PROMPT = `Eres el mentor de Real Life RPG, una app que convierte metas reales en un juego de rol. Cada semana revisas cómo le fue al jugador, como el informe de un buen mentor de videojuego: honesto, motivador y útil. Nunca genérico.

Recibes los datos de la semana: misiones completadas, saltadas y atascadas, campañas y fases, hábitos día por día, misiones del día, racha, XP por habilidad y evidencias. Cada misión o hábito tiene una referencia corta (m1, c1…).

Responde en español:
- summary: 2 o 3 frases, en tono de videojuego pero claro. Menciona el dato más importante de la semana.
- wins: de 0 a 4 logros concretos con datos reales ("Cerraste la Fase 1 de «Guitarra desde cero»", "Cumpliste «Leer 20 minutos» 6 de 7 días"). Si no hubo logros, lista vacía.
- stuck: de 0 a 3 problemas: misiones atascadas o hábitos que casi no se cumplen, con su referencia y la causa más probable (demasiado grande, poco clara, mal momento del día…). No inventes causas que contradigan los datos.
- adjustments: de 0 a 4 ajustes que el jugador pueda aplicar con un toque. Solo usa referencias que existan en los datos:
  - "split": divide una misión atascada (m#) en 2 o 3 misiones más pequeñas y concretas, que juntas cumplan lo mismo. Cada parte con title (empieza con verbo), difficulty de 1 a 5, description de 1 frase y steps de 2 a 4 objetivos medibles.
  - "difficulty": cambia la dificultad (1 a 5) de una misión pendiente (m#) que está claramente mal calibrada.
  - "archiveHabit": archiva un hábito (c#) que casi nunca se cumple y no aporta.
  - "addHabit": propone un hábito nuevo y pequeño (habit con title, difficulty 1 o 2 y steps), solo si ayuda a una campaña activa.
  Cada ajuste lleva reason: una frase con el porqué, usando los datos. Si la semana fue buena y nada necesita cambio, lista vacía.
- focus: de 1 a 3 misiones pendientes (m#) recomendadas para la próxima semana, con title y why (una frase). Prioriza lo que destraba el avance.

No menciones las referencias (m1, c1) en los textos que lee el jugador: usa los nombres.

${principlesPrompt('review')}
En la revisión, "principle" va en cada ajuste.`

const text = { type: 'string' }
const difficultySchema = { type: 'integer', minimum: 1, maximum: 5 }
const stepsSchema = { type: 'array', items: text, minItems: 2, maxItems: 4 }

export const REVIEW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: text,
    wins: { type: 'array', items: text, maxItems: 4 },
    stuck: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: { ref: text, title: text, cause: text },
        required: ['ref', 'title', 'cause'],
      },
    },
    adjustments: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['split', 'difficulty', 'archiveHabit', 'addHabit'] },
          ref: text,
          reason: text,
          principle: text,
          difficulty: difficultySchema,
          parts: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: {
              type: 'object',
              properties: { title: text, difficulty: difficultySchema, description: text, steps: stepsSchema },
              required: ['title', 'difficulty', 'description', 'steps'],
            },
          },
          habit: {
            type: 'object',
            properties: { title: text, difficulty: difficultySchema, steps: stepsSchema },
            required: ['title', 'difficulty', 'steps'],
          },
        },
        required: ['kind', 'reason', 'principle'],
      },
    },
    focus: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: { ref: text, title: text, why: text },
        required: ['ref', 'title', 'why'],
      },
    },
  },
  required: ['summary', 'wins', 'stuck', 'adjustments', 'focus'],
}

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max))
const required = (max: number) => clipped(max).pipe(z.string().min(1))
const difficulty = z.coerce.number().transform((value) => Math.min(5, Math.max(1, Math.round(value))) as Difficulty)
const steps = z
  .array(clipped(140))
  .default([])
  .transform((list) => list.filter(Boolean).slice(0, 4))

export const reviewSchema = z.object({
  summary: required(600),
  wins: z
    .array(clipped(240))
    .default([])
    .transform((list) => list.filter(Boolean).slice(0, 4)),
  stuck: z
    .array(z.object({ ref: clipped(10).default(''), title: required(120), cause: clipped(300).default('') }))
    .default([])
    .transform((list) => list.slice(0, 3)),
  adjustments: z
    .array(
      z.object({
        kind: z.enum(['split', 'difficulty', 'archiveHabit', 'addHabit']),
        ref: clipped(10).default(''),
        reason: clipped(300).default(''),
        principle,
        difficulty: difficulty.optional(),
        parts: z
          .array(z.object({ title: required(80), difficulty, description: clipped(300).default(''), steps }))
          .optional(),
        habit: z.object({ title: required(80), difficulty, steps }).optional(),
      }),
    )
    .default([])
    .transform((list) => list.slice(0, 4)),
  focus: z
    .array(z.object({ ref: clipped(10).default(''), title: required(120), why: clipped(240).default('') }))
    .default([])
    .transform((list) => list.slice(0, 3)),
}) satisfies z.ZodType<ReviewPlan>

const DAY_LETTERS = 'LMXJVSD'

/** Texto que se envía: solo datos del juego de esa semana. */
export function reviewInput(report: WeekReport): string {
  const lines = [`Semana del ${report.weekStart} al ${report.weekEnd}.`]
  lines.push(
    `XP ganado: ${report.xp}. Racha general (días con algún avance): ${report.streakStart} al empezar, ${report.streakEnd} al terminar.`,
  )
  const outcome = { fulfilled: '✓', failed: '✗', neutral: '·' }
  lines.push(`Días con algún avance (${DAY_LETTERS}): ${report.dayOutcomes.map((item) => outcome[item]).join('')}`)

  const section = (title: string, items: string[]) => {
    lines.push('', `${title}:`)
    lines.push(...(items.length > 0 ? items.map((item) => `- ${item}`) : ['- (ninguna)']))
  }
  section(
    'Campañas activas',
    report.campaigns.map(
      (item) =>
        `«${item.title}»: ${item.progress} %` +
        (item.currentAct ? `, en ${item.currentAct}` : ', completada') +
        (item.actsClosed.length > 0 ? `. Cerró esta semana: ${item.actsClosed.join(', ')}` : ''),
    ),
  )
  const where = (item: { campaign: string | null; act?: string | null }) =>
    [item.campaign && `«${item.campaign}»`, item.act].filter(Boolean).join(', ')
  section(
    'Misiones completadas',
    report.completed.map(
      (item) =>
        `${item.ref} «${item.title}» (dificultad ${item.difficulty}${item.boss ? ', jefe' : ''}${item.skill ? `, ${item.skill}` : ''}) ${where(item)}`,
    ),
  )
  section(
    'Misiones saltadas («ya sé hacer esto»)',
    report.skipped.map((item) => `${item.ref} «${item.title}» ${where(item)}`),
  )
  section(
    `Misiones atascadas (desbloqueadas hace ${'≥'}5 días sin hacerse)`,
    report.stuck.map(
      (item) =>
        `${item.ref} «${item.title}» (dificultad ${item.difficulty}, ${item.days} días, objetivos ${item.steps}${item.undone ? `, deshecha ${item.undone} veces` : ''}) ${where(item)}`,
    ),
  )
  section(
    'Misiones pendientes disponibles',
    report.open.map(
      (item) =>
        `${item.ref} «${item.title}» (dificultad ${item.difficulty}${item.boss ? ', jefe' : ''}) ${where(item)}`,
    ),
  )
  section(
    `Hábitos (${DAY_LETTERS}; ✓ hecho, ½ a medias, ✗ no hecho, ? sin registrar, · no le tocaba)`,
    report.habits.map(
      (item) =>
        `${item.ref} «${item.title}» (dificultad ${item.difficulty}): ${item.days}, ${item.done} de ${item.scheduled}`,
    ),
  )
  section(
    'Misiones del día',
    report.dailies.map((item) => `«${item.title}»: ${item.done ? 'hecha' : 'no hecha'}`),
  )
  section(
    'XP por habilidad',
    report.skills.map((item) => `${item.name}: ${item.xp} XP`),
  )
  lines.push('', `Evidencias guardadas (fotos o notas): ${report.evidence}.`)
  return lines.join('\n')
}

/** Genera la revisión de la semana. Con `thinking`, el modelo principal razona antes de responder. */
export async function generateWeeklyReview(
  request: HttpRequest,
  options: Resilience & { apiKey: string; model: string; thinking?: ThinkingLevel; report: WeekReport },
): Promise<ReviewPlan> {
  const { report, onStatus, fallbackModel, retry, ...call } = options
  const json = await callJson(request, {
    ...call,
    onStatus,
    fallbackModel,
    retry,
    system: REVIEW_PROMPT,
    input: reviewInput(report),
    schema: REVIEW_JSON_SCHEMA,
    temperature: 0.6,
  })
  return validated(reviewSchema, json)
}
