// @vitest-environment jsdom
// Pruebas de integración del flujo completo, con la app real montada y Gemini simulado.
// Ninguna prueba hace llamadas de red: todo pasa por el `httpRequest` falso de abajo.
import 'fake-indexeddb/auto'
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetActRuns } from '../ai/actRunner'
import { retryConfig } from '../ai/gemini'
import { resetDailyAttempts } from '../ai/dailyMission'
import { App } from '../App'
import { db } from '../data/appDb'
import {
  acceptCampaignPlan,
  completeQuest,
  createBounty,
  getCampaign,
  getHud,
  getMissions,
} from '../data/gameStore'
import { gameDayOf } from '../game/gameDay'
import type { HttpRequest, HttpResponse } from '../platform/http'
import { httpRequest } from '../platform/http'
import { actTwoMissions, generateReply, guitarDesign, interactionReply } from '../test/fixtures'
import { forget as forgetGeneratorDraft } from '../ui/GeneratorSheet'

vi.mock('../platform/http', () => ({ httpRequest: vi.fn() }))

const request = vi.mocked(httpRequest)
type Sent = Parameters<HttpRequest>[0]

const QUESTIONS = {
  questions: [
    { question: '¿Qué tanto sabes ya de guitarra?', options: ['Nada, empiezo de cero', 'Algunos acordes'] },
    { question: '¿Cuánto tiempo tienes a la semana?', options: ['2 horas', '4 horas'] },
  ],
}
const DAILY = {
  title: 'Reto de 60 cambios de acorde',
  difficulty: 2,
  description: 'Cambia entre Em y Am.',
  steps: ['Haz 60 cambios'],
  estimate: '20 min',
  skill: 'Ritmo',
}

const ok = (data: unknown): HttpResponse => ({ status: 200, data })
const bodyText = (sent: Sent) => JSON.stringify(sent.body)
const isInteraction = (sent: Sent) => sent.url.endsWith('/interactions')
const isQuestions = (sent: Sent) => bodyText(sent).includes('escribe de 2 a 4 preguntas')
const isDaily = (sent: Sent) => bodyText(sent).includes('misión del día')
const isAct = (sent: Sent) => bodyText(sent).includes('Diseña ahora las misiones del Acto')

/** Gemini simulado: responde según la tarea que se le pide. `overrides` permite forzar fallos. */
function gemini(
  overrides: Partial<Record<'questions' | 'design' | 'act' | 'daily', (sent: Sent) => HttpResponse | undefined>> = {},
) {
  request.mockImplementation(async (sent) => {
    if (isDaily(sent)) return overrides.daily?.(sent) ?? ok(generateReply(DAILY))
    if (isQuestions(sent)) return overrides.questions?.(sent) ?? ok(generateReply(QUESTIONS))
    if (isAct(sent)) {
      return overrides.act?.(sent) ?? ok(isInteraction(sent) ? interactionReply({ missions: actTwoMissions }) : generateReply({ missions: actTwoMissions }))
    }
    return overrides.design?.(sent) ?? ok(isInteraction(sent) ? interactionReply(guitarDesign) : generateReply(guitarDesign))
  })
}

const BUSY: HttpResponse = { status: 503, data: { error: { message: 'The model is overloaded' } } }
const SATURATED = /El servicio de IA está muy saturado en este momento/

const calls = (filter: (sent: Sent) => boolean) => request.mock.calls.map(([sent]) => sent).filter(filter)

beforeAll(() => {
  // Con todas las pruebas corriendo en paralelo, la base de datos simulada puede tardar más de un segundo.
  configure({ asyncUtilTimeout: 6000 })
  // jsdom no trae estas piezas del navegador.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

beforeEach(async () => {
  await db.delete()
  await db.open()
  sessionStorage.setItem('secret:gemini_api_key', 'llave-de-prueba')
  localStorage.clear()
  resetActRuns()
  resetDailyAttempts()
  forgetGeneratorDraft()
  request.mockReset()
  gemini()
  // Las esperas entre reintentos (1.5, 3 y 5 s) se saltan en las pruebas.
  retryConfig.sleep = async () => {}
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
})

const user = userEvent.setup()
const today = () => gameDayOf(new Date())

async function openMissions() {
  await user.click(await screen.findByRole('button', { name: 'Misiones' }))
}

async function startGenerator(idea = 'Quiero aprender a tocar guitarra') {
  await openMissions()
  await user.click(await screen.findByRole('button', { name: /Generar campaña con IA/ }))
  await user.type(await screen.findByLabelText(/Escribe tu meta/), idea)
  await user.click(screen.getByRole('button', { name: 'Siguiente' }))
}

/** Abre una misión del mapa y la completa desde su detalle. */
async function completeFromMap(title: RegExp, xp: number) {
  await user.click(await screen.findByRole('button', { name: title }))
  await user.click(await screen.findByRole('button', { name: `Completar +${xp} XP` }))
}

async function closeDetail() {
  const detail = screen.getAllByRole('dialog').find((dialog) => within(dialog).queryAllByRole('button', { name: 'Cerrar' }).length > 0)
  if (!detail) return
  await user.click(within(detail).getAllByRole('button', { name: 'Cerrar' })[0])
  await waitFor(() => expect(detail.isConnected).toBe(false))
}

describe('Generar una campaña', () => {
  it('idea → preguntas → diseño → vista previa → crear → Acto 1 → generar Acto 2', async () => {
    render(<App />)
    await startGenerator()

    // Preguntas previas, con el modelo rápido.
    await user.click(await screen.findByRole('button', { name: 'Nada, empiezo de cero' }))
    expect(calls(isQuestions)).toHaveLength(1)
    expect(calls(isQuestions)[0].url).toContain('gemini-3.5-flash-lite:generateContent')

    // Diseño con el modelo principal, pensando a fondo, con la meta y las respuestas.
    await user.click(screen.getByRole('button', { name: /Diseñar campaña/ }))
    const preview = await screen.findByDisplayValue('Del silencio al escenario')
    const [designCall] = calls((sent) => isInteraction(sent) && !isAct(sent))
    expect(designCall.body).toMatchObject({ model: 'gemini-4-hydrogen', generation_config: { thinking_level: 'high' } })
    expect(bodyText(designCall)).toContain('Quiero aprender a tocar guitarra')
    expect(bodyText(designCall)).toContain('¿Qué tanto sabes ya de guitarra? → Nada, empiezo de cero')
    expect(designCall.headers['x-goog-api-key']).toBe('llave-de-prueba')
    expect(bodyText(designCall)).not.toContain('llave-de-prueba')

    // Vista previa: análisis, actos, misiones del Acto 1 y jefe. Aún no se creó nada.
    expect(preview).toBeTruthy()
    expect(screen.getByText('Tocas 3 canciones completas sin detenerte y lo grabas.')).toBeTruthy()
    expect(screen.getByText(/El camino · 3 actos/)).toBeTruthy()
    expect(screen.getByText(/Misiones del Acto 1 · 3/)).toBeTruthy()
    expect(await db.campaigns.count()).toBe(0)

    // Los contratos sugeridos llegan desmarcados; se desmarca además una misión.
    const bounty = screen.getByRole('checkbox', { name: 'Incluir Practica cambios de acordes 10 minutos' }) as HTMLInputElement
    expect(bounty.checked).toBe(false)
    await user.click(screen.getByRole('checkbox', { name: 'Incluir Tu primera progresión' }))

    await user.click(screen.getByRole('button', { name: 'Crear campaña' }))

    // Se crea todo de una vez y se abre el mapa.
    const map = await screen.findByRole('dialog', { name: 'Del silencio al escenario' })
    const [campaign] = (await getMissions(db)).campaigns
    expect(campaign.actViews.map((act) => [act.status, act.quests.length])).toEqual([
      ['ready', 2],
      ['planned', 0],
      ['planned', 1],
    ])
    expect(await db.bounties.count()).toBe(0)
    expect(campaign.analysis?.duration).toBe('12 semanas')
    expect(campaign.brief?.answers).toEqual([{ question: '¿Qué tanto sabes ya de guitarra?', answer: 'Nada, empiezo de cero' }])
    expect(within(map).getByText('Campaña · Acto 1 de 3')).toBeTruthy()

    // Bloqueo de actos: el jefe se ve, pero su detalle es de solo lectura con el motivo.
    await user.click(within(map).getByRole('button', { name: /Misión jefe: El concierto/ }))
    expect(await screen.findByText('Completa el Acto 1 para desbloquear')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Completar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Ya sé hacer esto/ })).toBeNull()
    await closeDetail()

    // Completar el Acto 1 (una misión se salta con "Ya sé hacer esto").
    await user.click(within(map).getByRole('button', { name: /Misión: Afina tu guitarra/ }))
    await user.click(await screen.findByRole('button', { name: /Ya sé hacer esto/ }))
    await closeDetail()
    await completeFromMap(/Misión: Domina Mi menor/, 50)

    const celebration = await screen.findByRole('alertdialog', { name: 'Acto 1 completado' })
    expect(within(celebration).getByText('Ritmo y cambios')).toBeTruthy()
    expect((await getHud(db, today())).totalXp).toBe(50)

    // Generar el Acto 2 usando cómo le fue.
    await user.click(within(celebration).getByRole('button', { name: /Generar Acto 2/ }))
    expect(await screen.findByRole('button', { name: /Misión: Rasguea abajo-arriba/ })).toBeTruthy()

    const [actCall] = calls(isAct)
    expect(actCall.body).toMatchObject({ model: 'gemini-4-hydrogen', generation_config: { thinking_level: 'medium' } })
    expect(bodyText(actCall)).toContain('SALTADA (ya lo sabía)')
    expect(bodyText(actCall)).toContain('Domina Mi menor y La menor')
    expect(bodyText(actCall)).toContain('El concierto')

    const after = (await getCampaign(db, campaign.id))!
    expect(after.currentAct).toBe(2)
    expect(after.actViews[1]).toMatchObject({ status: 'ready', state: 'current' })
    expect(after.actViews[1].quests.map((quest) => quest.title)).toEqual(actTwoMissions.map((mission) => mission.title))
    expect(calls(isAct)).toHaveLength(1)
  }, 30_000)

  it('si el modelo principal está saturado, reintenta y responde el modelo de respaldo sin que el jugador haga nada', async () => {
    gemini({ design: (sent) => (isInteraction(sent) ? BUSY : undefined) })
    render(<App />)
    await startGenerator('Publicar mi app')
    await user.click(await screen.findByRole('button', { name: '2 horas' }))
    await user.click(screen.getByRole('button', { name: /Diseñar campaña/ }))

    // 1 intento + 3 reintentos con el modelo principal, y un último intento con el rápido.
    expect(await screen.findByDisplayValue('Del silencio al escenario')).toBeTruthy()
    expect(await screen.findByText('¡Listo!')).toBeTruthy()
    const designCalls = calls((sent) => !isQuestions(sent) && !isDaily(sent))
    expect(designCalls.map((sent) => (isInteraction(sent) ? 'principal' : 'respaldo'))).toEqual([
      'principal',
      'principal',
      'principal',
      'principal',
      'respaldo',
    ])
    expect(designCalls[4].url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(bodyText(designCalls[4])).toContain('Publicar mi app')
    expect(bodyText(designCalls[4])).toContain('¿Cuánto tiempo tienes a la semana? → 2 horas')
    expect(screen.queryByText(/503|429/)).toBeNull()
  }, 30_000)

  it('si todo sigue saturado, avisa en lenguaje claro, no crea nada y deja reintentar', async () => {
    gemini({ design: () => BUSY })
    render(<App />)
    await startGenerator('Publicar mi app')
    await user.click(await screen.findByRole('button', { name: '2 horas' }))
    await user.click(screen.getByRole('button', { name: /Diseñar campaña/ }))

    expect(await screen.findByText(SATURATED)).toBeTruthy()
    expect(screen.getByText(/No se creó nada. Tu meta y tus respuestas siguen aquí/)).toBeTruthy()
    expect(screen.queryByText(/503|429|overloaded/i)).toBeNull()
    expect(calls((sent) => !isQuestions(sent) && !isDaily(sent))).toHaveLength(5)
    expect(await db.campaigns.count()).toBe(0)
    expect(await db.skills.count()).toBe(0)

    // Al reintentar, ya con el servicio disponible, se conservan la meta y las respuestas.
    gemini()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByDisplayValue('Del silencio al escenario')).toBeTruthy()
    const lastCall = calls(isInteraction).at(-1)!
    expect(bodyText(lastCall)).toContain('Publicar mi app')
    expect(bodyText(lastCall)).toContain('¿Cuánto tiempo tienes a la semana? → 2 horas')
  }, 30_000)

  it('una llave rechazada se muestra de inmediato, sin reintentos ni respaldo', async () => {
    gemini({ design: () => ({ status: 403, data: { error: { message: 'The caller does not have permission' } } }) })
    render(<App />)
    await startGenerator('Publicar mi app')
    await user.click(await screen.findByRole('button', { name: /Saltar y diseñar/ }))

    expect(await screen.findByText(/Tu llave no tiene permiso para usar este modelo/)).toBeTruthy()
    expect(calls((sent) => !isQuestions(sent) && !isDaily(sent))).toHaveLength(1)
  }, 30_000)

  it('sin internet en las preguntas no se pierde la idea y se puede continuar sin ellas', async () => {
    request.mockImplementation(async (sent) => {
      if (isQuestions(sent)) throw new TypeError('Failed to fetch')
      return ok(isInteraction(sent) ? interactionReply(guitarDesign) : generateReply(DAILY))
    })
    render(<App />)
    await startGenerator('Correr 5 km')

    expect(await screen.findByText(/No hay conexión con Gemini/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Volver' }))
    expect((screen.getByLabelText(/Escribe tu meta/) as HTMLTextAreaElement).value).toBe('Correr 5 km')

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(await screen.findByRole('button', { name: 'Continuar sin preguntas' }))
    expect(await screen.findByDisplayValue('Del silencio al escenario')).toBeTruthy()
  }, 30_000)

  it('cerrar la hoja mientras diseña no crea campañas ni conserva respuestas tardías como creadas', async () => {
    let release: (response: HttpResponse) => void = () => {}
    gemini({ design: () => ({ status: 200, data: null }) })
    request.mockImplementation((sent) => {
      if (isQuestions(sent)) return Promise.resolve(ok(generateReply(QUESTIONS)))
      if (isDaily(sent)) return Promise.resolve(ok(generateReply(DAILY)))
      return new Promise<HttpResponse>((resolve) => (release = resolve))
    })
    render(<App />)
    await startGenerator()
    await user.click(await screen.findByRole('button', { name: /Saltar y diseñar/ }))
    expect(await screen.findByRole('status', { name: 'Diseñando tu campaña' })).toBeTruthy()

    // Se cancela a media generación y la respuesta llega después.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    release(ok(interactionReply(guitarDesign)))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(await db.campaigns.count()).toBe(0)
    expect(await db.sideQuests.count()).toBe(0)
    expect(screen.queryByDisplayValue('Del silencio al escenario')).toBeNull()
  }, 30_000)
})

describe('Generar el siguiente acto', () => {
  async function campaignAtActTwo() {
    const campaign = await acceptCampaignPlan(db, { ...guitarDesign, bounties: [] })
    for (const quest of (await getCampaign(db, campaign.id))!.actViews[0].quests) await completeQuest(db, quest.id)
    return campaign
  }

  it('si falla del todo, el acto queda pendiente con reintento y sin actos fantasma', async () => {
    const campaign = await campaignAtActTwo()
    gemini({ act: () => ({ status: 429, data: {} }) })
    render(<App />)
    await openMissions()
    await user.click(await screen.findByRole('button', { name: /Abrir el mapa de Del silencio/ }))

    await user.click(await screen.findByRole('button', { name: /Generar Acto 2/ }))
    expect(await screen.findByText(SATURATED)).toBeTruthy()
    expect(screen.getByText('El acto sigue pendiente.')).toBeTruthy()
    let view = (await getCampaign(db, campaign.id))!
    expect(view.actViews[1]).toMatchObject({ status: 'planned', state: 'current' })
    expect(view.actViews[1].quests).toHaveLength(0)
    // 4 intentos con el modelo principal y uno con el de respaldo.
    expect(calls(isAct)).toHaveLength(5)

    // Al reintentar con el servicio disponible, aparecen las misiones una sola vez.
    gemini()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: /Misión: Cambia de acorde sin mirar/ })).toBeTruthy()
    view = (await getCampaign(db, campaign.id))!
    expect(view.actViews[1].quests).toHaveLength(2)
    expect(view.actViews).toHaveLength(3)
    expect(calls(isAct)).toHaveLength(6)
  }, 30_000)

  it('si el modelo principal está saturado, el acto lo genera el modelo de respaldo', async () => {
    const campaign = await campaignAtActTwo()
    gemini({ act: (sent) => (isInteraction(sent) ? BUSY : undefined) })
    render(<App />)
    await openMissions()
    await user.click(await screen.findByRole('button', { name: /Abrir el mapa de Del silencio/ }))
    await user.click(await screen.findByRole('button', { name: /Generar Acto 2/ }))

    expect(await screen.findByRole('button', { name: /Misión: Rasguea abajo-arriba/ })).toBeTruthy()
    expect(calls(isAct).at(-1)!.url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(calls(isAct)).toHaveLength(5)
    expect((await getCampaign(db, campaign.id))!.actViews[1].quests).toHaveLength(2)
  }, 30_000)
})

describe('Misión del día', () => {
  it('se genera una sola vez por día con el modelo rápido, da XP extra y no cumple la racha', async () => {
    await acceptCampaignPlan(db, { ...guitarDesign, bounties: [] })
    await createBounty(db, { title: 'Tomar agua', difficulty: 1 })

    const first = render(<App />)
    const card = await screen.findByRole('region', { name: 'Misión del día' })
    expect(within(card).getByText('Reto de 60 cambios de acorde')).toBeTruthy()
    expect(calls(isDaily)).toHaveLength(1)
    expect(calls(isDaily)[0].url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(bodyText(calls(isDaily)[0])).toContain('Primeros acordes')

    // Abrir la app otra vez reutiliza la misión ya generada.
    first.unmount()
    render(<App />)
    const again = await screen.findByRole('region', { name: 'Misión del día' })
    expect(calls(isDaily)).toHaveLength(1)

    await user.click(within(again).getByRole('checkbox', { name: 'Reto de 60 cambios de acorde' }))
    await waitFor(async () => expect((await getHud(db, today())).totalXp).toBe(75))
    const hud = await getHud(db, today())
    expect(hud.todayFulfilled).toBe(false)
    expect((await db.xpEvents.toArray()).map((event) => event.kind)).toEqual(['daily'])
  }, 30_000)

  it('si falla, no se ve nada roto: ofrece reintentar y no insiste sola', async () => {
    await acceptCampaignPlan(db, { ...guitarDesign, bounties: [] })
    gemini({ daily: () => ({ status: 500, data: {} }) })

    const first = render(<App />)
    const retry = await screen.findByRole('button', { name: /No se pudo generar la misión del día/ })
    expect(screen.queryByRole('region', { name: 'Misión del día' })).toBeNull()
    expect(screen.getByText('Contratos de hoy')).toBeTruthy()

    // Volver a abrir la app el mismo día no repite la llamada automática.
    first.unmount()
    render(<App />)
    await screen.findByText('Contratos de hoy')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(isDaily)).toHaveLength(1)
    expect(retry.isConnected).toBe(false)

    // El botón de reintentar sí vuelve a llamar, y al funcionar aparece la misión.
    gemini()
    await user.click(await screen.findByRole('button', { name: /No se pudo generar la misión del día/ }))
    expect(await screen.findByRole('region', { name: 'Misión del día' })).toBeTruthy()
    expect(calls(isDaily)).toHaveLength(2)
  }, 30_000)

  it('sin llave o sin campañas la sección no aparece ni llama a la IA', async () => {
    render(<App />)
    await screen.findByText('Contratos de hoy')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(isDaily)).toHaveLength(0)
    expect(screen.queryByText(/misión del día/i)).toBeNull()

    cleanup()
    sessionStorage.clear()
    await acceptCampaignPlan(db, { ...guitarDesign, bounties: [] })
    render(<App />)
    await screen.findByText('Contratos de hoy')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(isDaily)).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Misión del día' })).toBeNull()
  }, 30_000)
})
