import { describe, expect, it, vi } from 'vitest'
import { generateAct } from '../ai/gemini'
import { actSchema, dailiesSchema } from '../ai/gemini/validation'
import { routeSchema } from '../ai/gemini/route'
import { reviewSchema } from '../ai/gemini/review'
import type { HttpRequest } from '../platform/http'
import { actTwoMissions, interactionReply } from '../test/fixtures'
import { PRINCIPLES, SOURCES, findPrinciple, principleId, principlesPrompt } from './library'

describe('Biblioteca de principios', () => {
  it('tiene 26 principios con ids únicos y fuentes que existen', () => {
    expect(PRINCIPLES).toHaveLength(26)
    expect(new Set(PRINCIPLES.map((item) => item.id)).size).toBe(26)
    const sourceIds = new Set(SOURCES.map((item) => item.id))
    for (const principle of PRINCIPLES) {
      expect(principle.uses.length).toBeGreaterThan(0)
      for (const source of principle.sources) expect(sourceIds.has(source)).toBe(true)
    }
  })

  it('solo acepta ids de la biblioteca, sin importar mayúsculas o espacios', () => {
    expect(principleId(' h4 ')).toBe('H4')
    expect(findPrinciple('A3')?.name).toBe('Practicar recordando')
    expect(principleId('H99')).toBeUndefined()
    expect(principleId('Hábitos atómicos')).toBeUndefined()
    expect(principleId(undefined)).toBeUndefined()
  })

  it('cada tarea recibe solo los principios que le tocan', () => {
    const route = principlesPrompt('route')
    expect(route).toContain('H4 · Empezar diminuto')
    expect(route).toContain('H3 · Apilar hábitos')
    expect(route).not.toContain('A3 ·')
    const act = principlesPrompt('act')
    expect(act).toContain('A3 · Practicar recordando')
    expect(act).not.toContain('H3 ·')
    expect(principlesPrompt('review')).toContain('SOLO en estos principios')
  })
})

describe('Principio en lo que genera la IA', () => {
  it('conserva el id válido y descarta uno inventado', () => {
    const [good, bad] = actSchema.parse({
      missions: [
        { ...actTwoMissions[0], principle: 'a1' },
        { ...actTwoMissions[1], principle: 'Método Kaizen' },
      ],
    }).missions
    expect(good.principle).toBe('A1')
    expect(bad.principle).toBeUndefined()
  })

  it('también en misiones del día, ruta y ajustes de la revisión', () => {
    const daily = dailiesSchema.parse({
      missions: [{ title: 'Camina 15 minutos', difficulty: 1, kind: 'free', principle: 'M3' }],
    })
    expect(daily.missions[0].principle).toBe('M3')

    const route = routeSchema.parse({
      habits: [{ title: 'Lectura', levels: ['Leer 2 páginas'], frequency: { kind: 'daily' }, principle: 'H4' }],
    })
    expect(route.habits[0].principle).toBe('H4')

    const review = reviewSchema.parse({
      summary: 'Buena semana.',
      adjustments: [{ kind: 'difficulty', ref: 'm1', reason: 'Muy grande', difficulty: 2, principle: 'H5' }],
    })
    expect(review.adjustments[0].principle).toBe('H5')
  })

  it('manda los principios del acto en las instrucciones', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({
      status: 200,
      data: interactionReply({ missions: actTwoMissions.map((item) => ({ ...item, principle: 'A9' })) }),
    })
    const missions = await generateAct(request, {
      apiKey: 'k',
      model: 'gemini-4-hydrogen',
      thinking: 'medium',
      brief: {
        campaign: 'Guitarra',
        idea: 'Aprender guitarra',
        answers: [],
        diagnosis: '',
        successCriteria: '',
        acts: [{ number: 1, title: 'Acordes', goal: 'Sonar limpio', difficulty: 2 }],
        nextAct: 1,
        previous: [],
        boss: 'El concierto',
        skills: ['Ritmo'],
      },
    })
    expect(missions.every((item) => item.principle === 'A9')).toBe(true)
    const body = JSON.stringify(request.mock.calls[0][0].body)
    expect(body).toContain('BIBLIOTECA DE PRINCIPIOS')
    expect(body).toContain('A9 · Atacar el punto débil')
  })
})
