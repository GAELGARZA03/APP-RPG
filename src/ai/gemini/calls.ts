// Llamadas públicas: preguntas, diseño, actos, detalle, misión del día y conexión.
import type { HttpRequest } from '../../platform/http'
import { recordFailure, recordSuccess } from '../quota'
import { z } from 'zod'
import { type ActBrief, actInput, designInput } from './inputs'
import {
  ACT_JSON_SCHEMA,
  DAILY_JSON_SCHEMA,
  DESIGN_JSON_SCHEMA,
  DETAIL_JSON_SCHEMA,
  QUESTIONS_JSON_SCHEMA,
} from './jsonSchemas'
import { ACT_PROMPT, DAILY_PROMPT, DESIGN_PROMPT, DETAIL_PROMPT, QUESTIONS_PROMPT } from './prompts'
import { type Resilience, callJson, validated } from './resilience'
import { errorForStatus, send } from './transport'
import {
  API_ROOT,
  AiError,
  type Answer,
  type CampaignDesign,
  MAX_IDEA_LENGTH,
  type MissionPlan,
  type PlayerContext,
  type Question,
  type TaskDetailPlan,
  type ThinkingLevel,
} from './types'
import {
  type DailyPlan,
  actSchema,
  dailySchema,
  designSchema,
  detailSchema,
  normalizeSkills,
  questionsSchema,
} from './validation'

function resilience({ onStatus, fallbackModel, retry }: Resilience): Resilience {
  return { onStatus, fallbackModel, retry }
}

interface Credentials extends Resilience {
  apiKey: string
  model: string
}

/** Preguntas previas (modelo rápido). Puede devolver una lista vacía si la meta ya lo dice todo. */
export async function askQuestions(request: HttpRequest, options: Credentials & { idea: string }): Promise<Question[]> {
  const json = await callJson(request, {
    ...resilience(options),
    apiKey: options.apiKey,
    model: options.model,
    system: QUESTIONS_PROMPT,
    input: options.idea.slice(0, MAX_IDEA_LENGTH),
    schema: QUESTIONS_JSON_SCHEMA,
    temperature: 0.5,
  })
  return validated(questionsSchema, json).questions
}

/** Diseña la campaña completa. Con `thinking`, el modelo razona a fondo antes de responder. */
export async function designCampaign(
  request: HttpRequest,
  options: Credentials & { idea: string; answers: Answer[]; context: PlayerContext; thinking?: ThinkingLevel },
): Promise<CampaignDesign> {
  const json = await callJson(request, {
    ...resilience(options),
    apiKey: options.apiKey,
    model: options.model,
    thinking: options.thinking,
    system: DESIGN_PROMPT,
    input: designInput(options.idea, options.answers, options.context),
    schema: DESIGN_JSON_SCHEMA,
  })
  return normalizeSkills(validated(designSchema, json))
}

/** Misiones del siguiente acto, según cómo le fue al jugador en los anteriores. */
export async function generateAct(
  request: HttpRequest,
  options: Credentials & { brief: ActBrief; thinking?: ThinkingLevel },
): Promise<MissionPlan[]> {
  const json = await callJson(request, {
    ...resilience(options),
    apiKey: options.apiKey,
    model: options.model,
    thinking: options.thinking,
    system: ACT_PROMPT,
    input: actInput(options.brief),
    schema: ACT_JSON_SCHEMA,
  })
  return validated(actSchema, json).missions
}

/** Escribe la descripción y los objetivos de una misión que ya existe. */
export async function detailTask(
  request: HttpRequest,
  options: Credentials & { title: string; campaign: string | null; daily: boolean },
): Promise<TaskDetailPlan> {
  const input = [
    `Misión: ${options.title}`,
    options.campaign ? `Campaña a la que pertenece: ${options.campaign}` : null,
    options.daily ? 'Es un hábito diario que se repite todos los días.' : 'Es una misión que se completa una sola vez.',
  ]
    .filter(Boolean)
    .join('\n')

  const json = await callJson(request, {
    ...resilience(options),
    apiKey: options.apiKey,
    model: options.model,
    system: DETAIL_PROMPT,
    input,
    schema: DETAIL_JSON_SCHEMA,
    temperature: 0.6,
  })
  const detail = validated(detailSchema, json)
  if (!detail.description && detail.steps.length === 0) throw new AiError('bad-response')
  return detail
}

/** Reto pequeño del día (modelo rápido). */
export async function generateDaily(
  request: HttpRequest,
  options: Credentials & {
    context: {
      campaign: string | null
      act: { number: number; title: string; goal: string } | null
      pending: string[]
      skills: string[]
    }
  },
): Promise<DailyPlan> {
  const { context } = options
  const input = [
    context.campaign ? `Campaña activa: ${context.campaign}` : 'No hay campaña activa: básate en las habilidades.',
    context.act ? `Acto actual: ${context.act.number}. ${context.act.title}. Objetivo: ${context.act.goal}` : null,
    context.pending.length > 0
      ? `Misiones pendientes del acto (no las copies): ${context.pending.map((item) => `"${item}"`).join('; ')}`
      : null,
    context.skills.length > 0 ? `Habilidades: ${context.skills.join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const json = await callJson(request, {
    ...resilience(options),
    apiKey: options.apiKey,
    model: options.model,
    system: DAILY_PROMPT,
    input,
    schema: DAILY_JSON_SCHEMA,
    temperature: 0.9,
  })
  return validated(dailySchema, json)
}

/**
 * Hace una generación mínima (unos pocos tokens). Consultar el modelo no basta:
 * una llave puede leer modelos y aun así no tener permiso para generar.
 */
export async function checkConnection(request: HttpRequest, options: Credentials): Promise<void> {
  const response = await send(request, {
    method: 'POST',
    url: `${API_ROOT}/models/${encodeURIComponent(options.model)}:generateContent`,
    headers: { 'x-goog-api-key': options.apiKey },
    body: {
      contents: [{ role: 'user', parts: [{ text: 'Responde solo: OK' }] }],
      generationConfig: { maxOutputTokens: 16 },
    },
    timeoutMs: 20_000,
  })
  if (response.status !== 200) {
    recordFailure(options.model, response.status)
    throw errorForStatus(response.status, response.data)
  }
  recordSuccess(options.model)
}

const modelListSchema = z.object({ models: z.array(z.object({ name: z.string() })).default([]) })

/**
 * Modelos que ofrece la cuenta de esta llave. Sirve para validar la llave sin gastar cuota de generación.
 * La llave viaja en la cabecera, como en todas las llamadas: nunca en la URL.
 */
export async function listModels(request: HttpRequest, apiKey: string): Promise<string[]> {
  const response = await send(request, {
    method: 'GET',
    url: `${API_ROOT}/models?pageSize=1000`,
    headers: { 'x-goog-api-key': apiKey },
    timeoutMs: 20_000,
  })
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
  const list = modelListSchema.safeParse(response.data)
  if (!list.success) throw new AiError('bad-response')
  return list.data.models.map((model) => model.name.replace(/^models\//, ''))
}
