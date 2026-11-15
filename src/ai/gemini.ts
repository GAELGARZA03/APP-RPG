// Cliente de Gemini. Cada pieza vive en src/ai/gemini/; el resto de la app importa desde aquí.
export { DEFAULT_FAST_MODEL, DEFAULT_MAIN_MODEL } from './models'
export { AiError, GEMINI_KEY_SECRET, MAX_IDEA_LENGTH } from './gemini/types'
export type {
  AiErrorKind,
  Answer,
  CampaignDesign,
  MissionPlan,
  PlayerContext,
  Question,
  TaskDetailPlan,
  ThinkingLevel,
} from './gemini/types'
export type { DailyPlan } from './gemini/validation'
export { buildRequest, errorForStatus } from './gemini/transport'
export { STATUS_MESSAGES, retryConfig } from './gemini/resilience'
export type { CallStage, CallStatus, Resilience, StatusListener } from './gemini/resilience'
export { actInput, designInput } from './gemini/inputs'
export type { ActBrief } from './gemini/inputs'
export {
  askQuestions,
  checkConnection,
  designCampaign,
  detailTask,
  generateAct,
  generateDaily,
  listModels,
} from './gemini/calls'
export { generateWeeklyReview, reviewInput } from './gemini/review'
