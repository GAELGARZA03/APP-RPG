// Validación con zod de lo que responde el modelo.
import { type Difficulty, skillKey } from '../../game/rules'
import { z } from 'zod'
import { type CampaignDesign, MAX_TITLE_LENGTH, type MissionPlan } from './types'

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

export const detailSchema = z.object({ description: optionalText(400), steps })

const missionSchema = detailSchema.extend({
  title,
  difficulty,
  estimate: optionalText(60),
  why: optionalText(240),
  tip: optionalText(240),
  skill: optionalText(40),
})

export const questionsSchema = z.object({
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

export const designSchema = z.object({
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
  habits: z
    .array(missionSchema)
    .default([])
    .transform((habits) => habits.slice(0, 3)),
})

export const actSchema = z.object({
  missions: z
    .array(missionSchema)
    .min(1)
    .transform((missions) => missions.slice(0, 8)),
})

export const dailySchema = detailSchema.extend({
  title,
  difficulty: z.coerce.number().transform((value) => (value >= 2 ? 2 : 1) as Difficulty),
  estimate: optionalText(60),
  skill: optionalText(80),
})

export type DailyPlan = z.infer<typeof dailySchema>

/** Las tres misiones del día; si la IA manda menos, se usan las que haya. */
export const dailiesSchema = z.object({
  missions: z
    .array(
      dailySchema.extend({
        kind: z.enum(['campaign', 'habit', 'free']).catch('free'),
      }),
    )
    .min(1)
    .transform((list) => list.slice(0, 3)),
})

export type DailiesPlan = z.infer<typeof dailiesSchema>['missions']

const MAX_LEAVES = 8

/** Quita sub-habilidades repetidas con otro nombre y amarra cada misión a una que exista. */
export function normalizeSkills(design: z.infer<typeof designSchema>): CampaignDesign {
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
    habits: design.habits.map(fix),
    skills: { area: design.skills.area, branch, leaves },
  }
}
