// Esquemas JSON que se le exigen al modelo en cada respuesta.

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

export const QUESTIONS_JSON_SCHEMA = {
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

export const DESIGN_JSON_SCHEMA = {
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

export const ACT_JSON_SCHEMA = {
  type: 'object',
  properties: { missions: { type: 'array', items: missionJsonSchema, minItems: 2, maxItems: 6 } },
  required: ['missions'],
}

export const DETAIL_JSON_SCHEMA = {
  type: 'object',
  properties: { description: text, steps: stepsSchema },
  required: ['description', 'steps'],
}

export const DAILY_JSON_SCHEMA = {
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
