// Tipos públicos, constantes y errores de la IA.
import type { Difficulty } from '../../game/rules'

/** Nombre del secreto cifrado que guarda la API key. */
export const GEMINI_KEY_SECRET = 'gemini_api_key'
export const MAX_IDEA_LENGTH = 8000

export const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
export const FAST_TIMEOUT_MS = 45_000
/** Diseñar con razonamiento alto puede tardar más de un minuto. */
export const THINKING_TIMEOUT_MS = 150_000
export const MAX_TITLE_LENGTH = 80

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
  /** Principio de la biblioteca en el que se basó la IA (H4, A1…). */
  principle?: string
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
  habits: MissionPlan[]
}

/** Lo único que se le cuenta al modelo sobre el jugador. */
export interface PlayerContext {
  level: number
  streak: number
  campaigns: Array<{ title: string; skill: string | null }>
  habits: string[]
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
  | 'overloaded'
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
  // Lo que ve el jugador cuando se agotaron los reintentos y el modelo de respaldo.
  overloaded: 'El servicio de IA está muy saturado en este momento. Por favor, intenta de nuevo en unos segundos.',
  network: 'No hay conexión con Gemini. Revisa tu internet.',
  blocked: 'Gemini no quiso responder a ese texto. Prueba a escribirlo de otra forma.',
  'bad-response': 'Gemini respondió algo incompleto o inesperado. Intenta generar de nuevo.',
  server: 'Gemini tuvo un problema. Intenta de nuevo en unos minutos.',
}

export class AiError extends Error {
  readonly kind: AiErrorKind
  /** Código HTTP real, solo para los registros de desarrollo; al jugador nunca se le muestra. */
  readonly status: number | null

  constructor(kind: AiErrorKind, status: number | null = null) {
    super(MESSAGES[kind])
    this.kind = kind
    this.status = status
  }

  /** Fallos pasajeros (saturación, límite por minuto, red): vale la pena reintentar solos. */
  get transient(): boolean {
    return this.kind === 'busy' || this.kind === 'quota' || this.kind === 'network'
  }

  /** Errores del modelo en sí, donde probar con el modelo rápido puede ayudar. */
  get modelRelated(): boolean {
    return ['no-permission', 'model', 'bad-request', 'quota', 'busy', 'bad-response', 'server'].includes(this.kind)
  }
}
