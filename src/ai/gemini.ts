import { z } from 'zod'
import { skillKey, type Difficulty } from '../game/rules'
import type { HttpRequest } from '../platform/http'

export { DEFAULT_FAST_MODEL, DEFAULT_MAIN_MODEL } from './models'

/** Nombre del secreto cifrado que guarda la API key. */
export const GEMINI_KEY_SECRET = 'gemini_api_key'
export const MAX_IDEA_LENGTH = 8000

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
const FAST_TIMEOUT_MS = 45_000
/** Diseñar con razonamiento alto puede tardar más de un minuto. */
const THINKING_TIMEOUT_MS = 150_000
const MAX_TITLE_LENGTH = 80

export type ThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh'

export interface TaskDetailPlan {
  description: string
  steps: string[]
}

export interface MissionPlan extends TaskDetailPlan {
  title: string
  difficulty: Difficulty
  /** Tiempo estimado en texto libre. */
  estimate: string
  why: string
  tip: string
  /** Sub-rama del árbol de habilidades. */
  skill: string
}

export interface Question {
  question: string
  options: string[]
}

export interface Answer {
  question: string
  answer: string
}

export interface CampaignDesign {
  campaign: string
  analysis: {
    diagnosis: string
    successCriteria: string
    obstacles: Array<{ obstacle: string; solution: string }>
    duration: string
  }
  skills: { area: string; branch: string; leaves: string[] }
  acts: Array<{ title: string; goal: string; difficulty: Difficulty }>
  /** Misiones del Acto 1. */
  missions: MissionPlan[]
  boss: MissionPlan
  bounties: MissionPlan[]
}

/** Lo único que se le cuenta al modelo sobre el jugador. */
export interface PlayerContext {
  level: number
  streak: number
  campaigns: Array<{ title: string; skill: string | null }>
  bounties: string[]
  skillPaths: string[]
}

export type AiErrorKind =
  | 'invalid-key'
  | 'api-disabled'
  | 'no-permission'
  | 'model'
  | 'bad-request'
  | 'quota'
  | 'busy'
  | 'network'
  | 'blocked'
  | 'bad-response'
  | 'server'

const MESSAGES: Record<AiErrorKind, string> = {
  'invalid-key': 'Gemini rechazó la API key. Revísala en Ajustes.',
  'api-disabled':
    'La API de Gemini no está activada en el proyecto de Google de tu llave. Actívala y espera unos minutos.',
  'no-permission':
    'Tu llave no tiene permiso para usar este modelo. Revisa en Google AI Studio que la API de Gemini esté activa en su proyecto.',
  model: 'El modelo configurado no existe o no está disponible. Revísalo en Ajustes.',
  'bad-request': 'Gemini no aceptó la petición con este modelo. Revisa el modelo en Ajustes.',
  quota: 'Se alcanzó el límite de uso de Gemini. Espera un momento e intenta de nuevo.',
  busy: 'El modelo de Gemini está saturado. Intenta de nuevo en un momento.',
  network: 'No hay conexión con Gemini. Revisa tu internet.',
  blocked: 'Gemini no quiso responder a ese texto. Prueba a escribirlo de otra forma.',
  'bad-response': 'Gemini respondió algo incompleto o inesperado. Intenta generar de nuevo.',
  server: 'Gemini tuvo un problema. Intenta de nuevo en unos minutos.',
}

export class AiError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind) {
    super(MESSAGES[kind])
    this.kind = kind
  }

  /** Errores del modelo en sí, donde probar con el modelo rápido puede ayudar. */
  get modelRelated(): boolean {
    return ['no-permission', 'model', 'bad-request', 'quota', 'busy', 'bad-response', 'server'].includes(this.kind)
  }
}

// --- Instrucciones ------------------------------------------------------------

const DIFFICULTY_RULE =
  'difficulty, de 1 a 5: 1 = menos de 15 minutos y sin esfuerzo; 2 = hasta 30 minutos; 3 = alrededor de una hora o esfuerzo moderado; 4 = varias horas o salir de la zona de confort; 5 = un día completo o un gran reto.'

const MISSION_RULES = `Cada misión debe ser concreta y medible, como una misión de videojuego: qué hacer exactamente, cuántas veces o cuánto tiempo, y con qué.
- Mal: "Repasar los fundamentos de mezclas falsas y cortes". Bien: "Practicar 3 cortes falsos, 10 veces cada uno".
- title: máximo 70 caracteres, en español, empieza con un verbo, con tono de videojuego pero claro.
- description: 1 o 2 frases que expliquen el objetivo y cómo saber que terminaste.
- steps: de 2 a 4 objetivos medibles con cantidades, nombres o tiempos (por ejemplo "Cambia entre Em y Am 20 veces con metrónomo a 60 bpm"). Empieza cada uno con un verbo.
- ${DIFFICULTY_RULE}`

const FULL_MISSION_RULES = `${MISSION_RULES}
- estimate: tiempo realista, corto ("15 min", "45 min", "3 sesiones de 20 min").
- why: una frase sobre por qué esta misión importa para la meta.
- tip: un consejo práctico y específico, no una frase motivacional.
- skill: el nombre exacto de una de las sub-habilidades de la campaña.`

const QUESTIONS_PROMPT = `Eres el diseñador de campañas de Real Life RPG, una app que convierte metas reales en un juego de rol.
Antes de diseñar la campaña necesitas conocer al jugador. Lee su meta y escribe de 2 a 4 preguntas cortas, solo las que hagan falta para planear bien y que la meta no responda ya.

Cubre, en este orden de importancia: su nivel actual en ese tema, el tiempo disponible por semana, la fecha objetivo o plazo, y los recursos o restricciones (equipo, dinero, lugar).
- question: máximo 90 caracteres, directa y específica de la meta (no "¿Cuál es tu nivel?" sino "¿Qué tanto sabes ya de guitarra?").
- options: de 2 a 4 respuestas cortas (máximo 40 caracteres), distintas entre sí y realistas, ordenadas de menos a más. El jugador también puede escribir la suya.
- Todo en español. No preguntes datos personales (nombre, edad, salud, dirección).`

const DESIGN_PROMPT = `Eres el diseñador de campañas de Real Life RPG, una app que convierte metas reales en un juego de rol. Diseñas como un buen diseñador de videojuegos: un camino por actos, con dificultad creciente, una prueba final y un análisis honesto de la meta.

Recibes la meta del jugador, sus respuestas a unas preguntas previas y algo de contexto. Usa TODO lo que respondió (nivel, tiempo por semana, plazo, recursos): el plan debe caber en ese tiempo y partir de ese nivel, sin repetir lo que ya sabe. Si falta un dato, asume lo más prudente y dilo en el diagnóstico.

Qué devolver:
- campaign: nombre corto y evocador de la aventura (máximo 60 caracteres), no la meta copiada. "Del silencio al escenario", no "Aprender guitarra".
- analysis.diagnosis: 2 a 4 frases. De dónde parte el jugador, qué es realista lograr con su tiempo (haz la cuenta de horas totales) y qué queda fuera de esta campaña.
- analysis.successCriteria: una frase verificable que complete "Lo lograste cuando…", con cantidades.
- analysis.obstacles: de 2 a 4 obstáculos probables para ESTA meta y ESTE jugador, cada uno con una solución concreta.
- analysis.duration: duración total estimada ("12 semanas").
- acts: de 2 a 5 actos según el tamaño real de la meta. Una meta de un par de semanas tiene 2; un proyecto de varios meses, 4 o 5. No uses siempre el mismo número. Cada acto tiene un title corto, un goal de una frase con el resultado y el tramo de tiempo ("Semanas 1 a 3: sonar limpio con 4 acordes") y una difficulty que nunca baja de un acto al siguiente. El último acto es el de la prueba final.
- missions: SOLO las misiones del Acto 1. La cantidad depende de lo que ese acto necesite, entre 2 y 6: no uses un número fijo. Van de fácil a difícil, y la primera se puede hacer hoy mismo en menos de 20 minutos. Los demás actos se detallarán después, según cómo le vaya al jugador.
- boss: la misión jefe que cierra el último acto. Dificultad 4 o 5, claramente distinta de las demás: una demostración o entrega final que prueba el criterio de éxito (tocar ante alguien, publicar, presentar, competir). Su último objetivo pide dejar evidencia (foto o nota) en la bitácora.
- skills: area es el área general en 1 o 2 palabras ("Música", "Programación", "Salud"); branch es la habilidad concreta de esta meta ("Guitarra"); leaves son de 3 a 6 sub-habilidades que cubren TODA la campaña ("Fundamentos", "Acordes abiertos", "Ritmo", "Repertorio"). Si el contexto lista habilidades existentes que apliquen, reutiliza exactamente esos nombres en vez de inventar sinónimos.
- bounties: de 0 a 3 contratos diarios de 5 a 15 minutos, SOLO si la meta se sostiene con práctica diaria. Deben ser realistas sumados a los contratos que el jugador ya tiene: si ya tiene 4 o más, propone como máximo 1, y nunca repitas uno existente. Si la meta es un proyecto sin práctica diaria, devuelve una lista vacía.

${FULL_MISSION_RULES}

Ejemplo del nivel esperado (meta: aprender guitarra; principiante; 4 horas a la semana; 3 meses; tiene guitarra acústica):
- Campaña "Del silencio al escenario". Diagnóstico: sin bases; con unas 48 horas es realista dominar acordes abiertos, cambios y rasgueo básico; la cejilla queda fuera. Éxito: tocar 3 canciones completas sin detenerse y grabarlo.
- Actos: 1 "Primeros acordes" (semanas 1 a 3), 2 "Ritmo y cambios" (4 a 7), 3 "Primeras canciones" (8 a 11), 4 "El concierto" (semana 12).
- Acto 1: "Afina tu guitarra y conoce sus cuerdas" (dificultad 1, 15 min), "Domina Mi menor y La menor" (2, 30 min: forma cada acorde 10 veces sin trastes muertos; cambia entre Em y Am 20 veces a 60 bpm), "Agrega Do y Sol a tu arsenal" (3), "Tu primera progresión" (3: Sol–Re–Em–Do a 70 bpm durante 2 minutos sin detenerte).
- Jefe: "El concierto" (5): toca 3 canciones completas para al menos una persona y grábalo sin cortes.
- Contrato diario: "Practica cambios de acordes 10 minutos".

Lo que NO debes hacer: "Practicar acordes", "Mejorar el ritmo", "Practicar más", "Seguir mejorando"; todas con la misma dificultad; siempre la misma cantidad de misiones; sin cantidades ni forma de saber que terminaste; ignorar lo que el jugador respondió.

Todo en español. No inventes datos personales del jugador.`

const ACT_PROMPT = `Eres el diseñador de campañas de Real Life RPG, una app que convierte metas reales en un juego de rol.
El jugador terminó un acto de su campaña. Diseña las misiones del SIGUIENTE acto usando cómo le fue.

Cómo adaptar:
- Si saltó misiones ("ya lo sabía"), ese tema está dominado: no lo repitas y sube el nivel.
- Si terminó el acto mucho más rápido de lo previsto, sube la exigencia; si tardó mucho o deshizo misiones, da pasos más pequeños y refuerza lo que costó.
- Las misiones deben cumplir el objetivo del acto y acercar al jugador a la misión jefe, sin adelantarla ni repetirla.
- missions: entre 2 y 6 según lo que el acto necesite (no un número fijo), de fácil a difícil, con dificultad acorde a la prevista para el acto.
- skill: usa una de las sub-habilidades existentes de la campaña; crea una nueva solo si el acto abre un tema que ninguna cubre.

${FULL_MISSION_RULES}

Todo en español. No inventes datos personales del jugador.`

const DETAIL_PROMPT = `Eres el diseñador de misiones de Real Life RPG, una app que convierte metas reales en un juego de rol.
Te doy el título de una misión que ya existe. Escribe su descripción y sus objetivos para que sea concreta.
${MISSION_RULES}
- Respeta la intención del título; no lo cambies por otra cosa.
- No inventes datos personales del usuario.`

const DAILY_PROMPT = `Eres el diseñador de misiones de Real Life RPG, una app que convierte metas reales en un juego de rol.
Diseña la "misión del día": UN reto pequeño, de 15 a 30 minutos, que el jugador pueda hacer hoy y que lo acerque al acto actual de su campaña o haga crecer una de sus habilidades.
- Debe ser distinto de las misiones pendientes que te doy (no las copies): un ejercicio, un mini reto o una variación divertida.
- title: máximo 70 caracteres, empieza con un verbo, con tono de videojuego pero claro.
- description: 1 o 2 frases con el objetivo y cómo saber que terminaste.
- steps: de 1 a 3 objetivos medibles con cantidades o tiempos.
- difficulty: 1 (unos 15 minutos) o 2 (hasta 30 minutos).
- estimate: el tiempo, por ejemplo "20 min".
- skill: el nombre exacto de una de las habilidades que te doy.
Todo en español. No inventes datos personales del jugador.`

// --- Esquemas JSON que se le exigen al modelo ---------------------------------

const text = { type: 'string' }
const difficultySchema = { type: 'integer', minimum: 1, maximum: 5 }
const stepsSchema = { type: 'array', items: text, minItems: 2, maxItems: 4 }

const missionJsonSchema = {
  type: 'object',
  properties: {
    title: text,
    difficulty: difficultySchema,
    description: text,
    steps: stepsSchema,
    estimate: text,
    why: text,
    tip: text,
    skill: text,
  },
  required: ['title', 'difficulty', 'description', 'steps', 'estimate', 'why', 'tip', 'skill'],
}

const QUESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 2,
      maxItems: 4,
      items: {
        type: 'object',
        properties: { question: text, options: { type: 'array', items: text, minItems: 2, maxItems: 4 } },
        required: ['question', 'options'],
      },
    },
  },
  required: ['questions'],
}

const DESIGN_JSON_SCHEMA = {
  type: 'object',
  properties: {
    campaign: text,
    analysis: {
      type: 'object',
      properties: {
        diagnosis: text,
        successCriteria: text,
        obstacles: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: { type: 'object', properties: { obstacle: text, solution: text }, required: ['obstacle', 'solution'] },
        },
        duration: text,
      },
      required: ['diagnosis', 'successCriteria', 'obstacles', 'duration'],
    },
    skills: {
      type: 'object',
      properties: { area: text, branch: text, leaves: { type: 'array', items: text, minItems: 3, maxItems: 6 } },
      required: ['area', 'branch', 'leaves'],
    },
    acts: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        properties: { title: text, goal: text, difficulty: difficultySchema },
        required: ['title', 'goal', 'difficulty'],
      },
    },
    missions: { type: 'array', items: missionJsonSchema, minItems: 2, maxItems: 6 },
    boss: missionJsonSchema,
    bounties: { type: 'array', items: missionJsonSchema, maxItems: 3 },
  },
  required: ['campaign', 'analysis', 'skills', 'acts', 'missions', 'boss', 'bounties'],
}

const ACT_JSON_SCHEMA = {
  type: 'object',
  properties: { missions: { type: 'array', items: missionJsonSchema, minItems: 2, maxItems: 6 } },
  required: ['missions'],
}

const DETAIL_JSON_SCHEMA = {
  type: 'object',
  properties: { description: text, steps: stepsSchema },
  required: ['description', 'steps'],
}

const DAILY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: text,
    difficulty: { type: 'integer', minimum: 1, maximum: 2 },
    description: text,
    steps: { type: 'array', items: text, minItems: 1, maxItems: 3 },
    estimate: text,
    skill: text,
  },
  required: ['title', 'difficulty', 'description', 'steps', 'estimate', 'skill'],
}

// --- Validación ----------------------------------------------------------------
// La respuesta de la IA nunca se usa sin validarla. Se recortan textos largos en vez de rechazarlos.

const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max))
const optionalText = (max: number) => clipped(max).default('')
const title = clipped(MAX_TITLE_LENGTH).pipe(z.string().min(1))
const difficulty = z.coerce.number().transform((value) => Math.min(5, Math.max(1, Math.round(value))) as Difficulty)
const steps = z
  .array(clipped(140))
  .default([])
  .transform((list) => list.filter(Boolean).slice(0, 5))

const detailSchema = z.object({ description: optionalText(400), steps })

const missionSchema = detailSchema.extend({
  title,
  difficulty,
  estimate: optionalText(60),
  why: optionalText(240),
  tip: optionalText(240),
  skill: optionalText(40),
})

const questionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: clipped(160),
        options: z
          .array(clipped(60))
          .default([])
          .transform((options) => [...new Set(options.filter(Boolean))].slice(0, 4)),
      }),
    )
    .default([])
    .transform((questions) => questions.filter((item) => item.question && item.options.length >= 2).slice(0, 4)),
})

const designSchema = z.object({
  campaign: title,
  analysis: z
    .object({
      diagnosis: optionalText(700),
      successCriteria: optionalText(300),
      obstacles: z
        .array(z.object({ obstacle: optionalText(160), solution: optionalText(240) }))
        .default([])
        .transform((list) => list.filter((item) => item.obstacle).slice(0, 4)),
      duration: optionalText(60),
    })
    .default({ diagnosis: '', successCriteria: '', obstacles: [], duration: '' }),
  skills: z
    .object({
      area: optionalText(40),
      branch: optionalText(40),
      leaves: z.array(clipped(40)).default([]),
    })
    .default({ area: '', branch: '', leaves: [] }),
  acts: z
    .array(z.object({ title: clipped(60).pipe(z.string().min(1)), goal: optionalText(200), difficulty }))
    .min(1)
    .transform((acts) => acts.slice(0, 5)),
  missions: z
    .array(missionSchema)
    .min(1)
    .transform((missions) => missions.slice(0, 8)),
  boss: missionSchema,
  bounties: z
    .array(missionSchema)
    .default([])
    .transform((bounties) => bounties.slice(0, 3)),
})

const actSchema = z.object({
  missions: z
    .array(missionSchema)
    .min(1)
    .transform((missions) => missions.slice(0, 8)),
})

const dailySchema = detailSchema.extend({
  title,
  difficulty: z.coerce.number().transform((value) => (value >= 2 ? 2 : 1) as Difficulty),
  estimate: optionalText(60),
  skill: optionalText(80),
})

export type DailyPlan = z.infer<typeof dailySchema>

const MAX_LEAVES = 8

/** Quita sub-habilidades repetidas con otro nombre y amarra cada misión a una que exista. */
function normalizeSkills(design: z.infer<typeof designSchema>): CampaignDesign {
  const branch = design.skills.branch || design.campaign.slice(0, 40)
  const leaves: string[] = []
  const add = (name: string) => {
    const key = skillKey(name)
    if (!key || key === skillKey(branch)) return null
    const existing = leaves.find((leaf) => skillKey(leaf) === key)
    if (existing) return existing
    if (leaves.length >= MAX_LEAVES) return null
    leaves.push(name)
    return name
  }
  design.skills.leaves.forEach(add)
  const leafFor = (name: string) => add(name.split(/[›>/]/).pop()?.trim() ?? '') ?? leaves[0] ?? ''
  const fix = (mission: MissionPlan): MissionPlan => ({ ...mission, skill: leafFor(mission.skill) })

  // La dificultad de los actos nunca baja.
  let floor = 1 as Difficulty
  const acts = design.acts.map((act) => {
    floor = Math.max(floor, act.difficulty) as Difficulty
    return { ...act, difficulty: floor }
  })

  return {
    ...design,
    acts,
    missions: design.missions.map(fix),
    boss: fix(design.boss),
    bounties: design.bounties.map(fix),
    skills: { area: design.skills.area, branch, leaves },
  }
}

// --- Transporte ----------------------------------------------------------------

function errorMessageOf(data: unknown): string {
  const error = (data as { error?: { message?: unknown } } | null)?.error
  return typeof error?.message === 'string' ? error.message : ''
}

export function errorForStatus(status: number, data?: unknown): AiError {
  const message = errorMessageOf(data)
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return new AiError('api-disabled')
  }
  if (status === 403) return new AiError('no-permission')
  if (status === 401 || (status === 400 && /api.?key/i.test(message))) return new AiError('invalid-key')
  // Un 400 sin mención de la llave es un parámetro que el modelo no acepta (por ejemplo, el razonamiento).
  if (status === 400) return new AiError(message ? 'bad-request' : 'invalid-key')
  if (status === 404) return new AiError('model')
  if (status === 429) return new AiError('quota')
  if (status === 503) return new AiError('busy')
  return new AiError('server')
}

const generateResponseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
      }),
    )
    .optional(),
})

const interactionResponseSchema = z.object({
  status: z.string().optional(),
  steps: z
    .array(
      z.object({
        type: z.string().optional(),
        content: z.array(z.object({ type: z.string().optional(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
})

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new AiError('bad-response')
  }
}

/** Extrae el JSON que `generateContent` devolvió como texto, o lanza el error adecuado. */
function extractGenerateJson(data: unknown): unknown {
  const response = generateResponseSchema.safeParse(data)
  if (!response.success) throw new AiError('bad-response')
  if (response.data.promptFeedback?.blockReason) throw new AiError('blocked')

  const candidate = response.data.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('blocked')
  }
  return parseJsonText(candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '')
}

/** Extrae el JSON de una respuesta de la API Interactions (pasos `thought` y `model_output`). */
function extractInteractionJson(data: unknown): unknown {
  const response = interactionResponseSchema.safeParse(data)
  // `incomplete`: el modelo agotó sus tokens pensando y no terminó la respuesta.
  if (!response.success || (response.data.status && response.data.status !== 'completed')) {
    throw new AiError('bad-response')
  }
  const output = (response.data.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((block) => block.text ?? '')
    .join('')
  return parseJsonText(output)
}

interface CallOptions {
  apiKey: string
  model: string
  system: string
  input: string
  schema: object
  /** Con nivel de razonamiento se usa la API Interactions, que es donde Google lo documenta. */
  thinking?: ThinkingLevel
  temperature?: number
}

/** Cuerpo de la petición; se exporta para probar que el esquema y el razonamiento siempre viajan. */
export function buildRequest(options: Omit<CallOptions, 'apiKey'>): {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  timeoutMs: number
} {
  if (options.thinking) {
    return {
      url: `${API_ROOT}/interactions`,
      headers: { 'Api-Revision': '2026-05-20' },
      body: {
        model: options.model,
        system_instruction: options.system,
        input: options.input,
        // No hace falta que Google guarde la conversación: cada llamada es independiente.
        store: false,
        generation_config: { thinking_level: options.thinking },
        response_format: { type: 'text', mime_type: 'application/json', schema: options.schema },
      },
      timeoutMs: THINKING_TIMEOUT_MS,
    }
  }
  return {
    url: `${API_ROOT}/models/${encodeURIComponent(options.model)}:generateContent`,
    headers: {},
    body: {
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: 'user', parts: [{ text: options.input }] }],
      generationConfig: {
        // Sin el esquema, el modelo inventa su propia estructura: nunca se quita.
        responseMimeType: 'application/json',
        responseJsonSchema: options.schema,
        temperature: options.temperature ?? 0.7,
      },
    },
    timeoutMs: FAST_TIMEOUT_MS,
  }
}

async function send(request: HttpRequest, options: Parameters<HttpRequest>[0]) {
  try {
    return await request(options)
  } catch {
    throw new AiError('network')
  }
}

async function callJson(request: HttpRequest, options: CallOptions): Promise<unknown> {
  const { apiKey, ...rest } = options
  const built = buildRequest(rest)
  const response = await send(request, {
    method: 'POST',
    url: built.url,
    // La llave viaja solo en esta cabecera, nunca en la URL ni en el cuerpo.
    headers: { 'x-goog-api-key': apiKey, ...built.headers },
    body: built.body,
    timeoutMs: built.timeoutMs,
  })
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
  return options.thinking ? extractInteractionJson(response.data) : extractGenerateJson(response.data)
}

function validated<Output>(schema: z.ZodType<Output>, json: unknown): Output {
  const result = schema.safeParse(json)
  if (!result.success) throw new AiError('bad-response')
  return result.data
}

// --- Textos que se envían -------------------------------------------------------

function contextLines(context: PlayerContext): string[] {
  return [
    `Nivel del jugador: ${context.level}. Racha actual: ${context.streak} días.`,
    context.campaigns.length > 0
      ? `Campañas activas (no las repitas): ${context.campaigns
          .map((campaign) => (campaign.skill ? `"${campaign.title}" [${campaign.skill}]` : `"${campaign.title}"`))
          .join('; ')}.`
      : 'No tiene otras campañas activas.',
    context.bounties.length > 0
      ? `Contratos diarios que ya tiene (${context.bounties.length}): ${context.bounties.map((b) => `"${b}"`).join('; ')}.`
      : 'No tiene contratos diarios.',
    context.skillPaths.length > 0
      ? `Habilidades existentes en su árbol (reutiliza estos nombres si aplican): ${context.skillPaths.join('; ')}.`
      : 'Su árbol de habilidades está vacío.',
  ]
}

export function designInput(idea: string, answers: Answer[], context: PlayerContext): string {
  const answered = answers.filter((answer) => answer.answer.trim())
  return [
    `META DEL JUGADOR:\n${idea.slice(0, MAX_IDEA_LENGTH)}`,
    answered.length > 0
      ? `RESPUESTAS A LAS PREGUNTAS PREVIAS:\n${answered.map((item) => `- ${item.question} → ${item.answer}`).join('\n')}`
      : 'El jugador no respondió preguntas previas: asume lo más prudente.',
    `CONTEXTO:\n${contextLines(context).join('\n')}`,
  ].join('\n\n')
}

/** Lo que la IA necesita para diseñar el siguiente acto. */
export interface ActBrief {
  campaign: string
  idea: string
  answers: Answer[]
  diagnosis: string
  successCriteria: string
  acts: Array<{ number: number; title: string; goal: string; difficulty: Difficulty }>
  nextAct: number
  previous: Array<{
    number: number
    title: string
    days: number
    missions: Array<{ title: string; difficulty: Difficulty; skipped: boolean; undone: number }>
  }>
  boss: string | null
  skills: string[]
}

export function actInput(brief: ActBrief): string {
  const history = brief.previous.map((act) => {
    const missions = act.missions.map((mission) => {
      const result = mission.skipped
        ? 'SALTADA (ya lo sabía)'
        : `completada${mission.undone > 0 ? `, la deshizo ${mission.undone} ${mission.undone === 1 ? 'vez' : 'veces'}` : ''}`
      return `  - "${mission.title}" (dificultad ${mission.difficulty}): ${result}`
    })
    return [`Acto ${act.number} "${act.title}": lo terminó en ${act.days} ${act.days === 1 ? 'día' : 'días'}.`, ...missions].join('\n')
  })

  return [
    `CAMPAÑA: ${brief.campaign}`,
    brief.idea ? `META ORIGINAL:\n${brief.idea.slice(0, 2000)}` : null,
    brief.answers.length > 0
      ? `LO QUE RESPONDIÓ AL INICIO:\n${brief.answers.map((item) => `- ${item.question} → ${item.answer}`).join('\n')}`
      : null,
    brief.diagnosis ? `DIAGNÓSTICO: ${brief.diagnosis}` : null,
    brief.successCriteria ? `CRITERIO DE ÉXITO: ${brief.successCriteria}` : null,
    `ACTOS:\n${brief.acts.map((act) => `${act.number}. ${act.title} (dificultad ${act.difficulty}): ${act.goal}`).join('\n')}`,
    `CÓMO LE FUE:\n${history.join('\n')}`,
    brief.boss ? `MISIÓN JEFE AL FINAL DE LA CAMPAÑA: "${brief.boss}"` : null,
    brief.skills.length > 0 ? `SUB-HABILIDADES DE LA CAMPAÑA: ${brief.skills.join('; ')}` : null,
    `Diseña ahora las misiones del Acto ${brief.nextAct}.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

// --- Llamadas --------------------------------------------------------------------

interface Credentials {
  apiKey: string
  model: string
}

/** Preguntas previas (modelo rápido). Puede devolver una lista vacía si la meta ya lo dice todo. */
export async function askQuestions(
  request: HttpRequest,
  options: Credentials & { idea: string },
): Promise<Question[]> {
  const json = await callJson(request, {
    ...options,
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
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
}
