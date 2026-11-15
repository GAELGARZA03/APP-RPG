// No es una prueba: genera los escenarios que se cargan en "RPG Pruebas" por USB
// (`npm run escenario <nombre>`). Solo corre así o con `npm run seed:build`; en `npm test` se omite.
// Cada escenario se arma con las funciones reales del juego, así que sus datos siempre son válidos.
import 'fake-indexeddb/auto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { GameDatabase } from '../data/db'
import {
  acceptCampaignPlan,
  addActMissions,
  addEvidence,
  completeHabit,
  completeQuest,
  createHabit,
  createSideQuest,
  getCampaign,
  getHud,
  getWeekReport,
  planToReview,
  setHabitState,
  saveDaily,
  saveDailyNote,
  saveReview,
  setSleep,
  skipSideQuest,
  toggleStep,
  weekStartOf,
} from '../data/gameStore'
import { addDays, gameDayOf, type GameDay } from '../game/gameDay'
import { actTwoMissions, guitarDesign } from './fixtures'

const building = process.env.SEED_BUILD === '1' || process.env.npm_lifecycle_event === 'seed:build'

/** Hace `days` días de juego, a la hora indicada. El día de juego cierra a las 4:00 a. m. */
function ago(days: number, hour = 12) {
  const date = new Date(Date.now() - 4 * 60 * 60 * 1000)
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date
}

/** Escribe las tablas del juego en scripts/telefono/escenarios/<nombre>.json y borra la base temporal. */
async function exportScenario(db: GameDatabase, name: string) {
  // La configuración no viaja: al cargar se conserva la del teléfono (llave, modelos, perfil).
  const stores: Record<string, unknown[]> = {}
  for (const table of [
    db.habits,
    db.campaigns,
    db.sideQuests,
    db.xpEvents,
    db.player,
    db.skills,
    db.evidence,
    db.dailies,
    db.reviews,
    db.habitLogs,
    db.dailyNotes,
    db.sleep,
  ]) {
    stores[table.name] = await table.toArray()
  }
  mkdirSync('scripts/telefono/escenarios', { recursive: true })
  writeFileSync(
    `scripts/telefono/escenarios/${name}.json`,
    JSON.stringify({ app: 'real-life-rpg', kind: 'volcado', createdAt: new Date().toISOString(), stores }, null, 1),
  )
  await db.delete()
}

/** XP suelto, sin misión, para subir de nivel. */
async function grantXp(db: GameDatabase, xp: number) {
  await db.xpEvents.add({
    id: crypto.randomUUID(),
    kind: 'sideQuest',
    taskId: 'escenario-xp',
    day: gameDayOf(ago(0)),
    xp,
  })
}

const level = async (db: GameDatabase) => (await getHud(db, gameDayOf(new Date()))).level

/** Campaña corta de un acto: dos misiones y el jefe. */
const readingDesign: typeof guitarDesign = {
  campaign: 'El lector de medianoche',
  analysis: {
    diagnosis:
      'Lees a ratos y sin constancia. Con 20 minutos diarios es realista terminar un libro corto en dos semanas.',
    successCriteria: 'Terminas un libro de 150 páginas y escribes una reseña de 100 palabras.',
    obstacles: [{ obstacle: 'El celular antes de dormir', solution: 'Déjalo cargando fuera del cuarto.' }],
    duration: '2 semanas',
  },
  skills: { area: 'Mente', branch: 'Lectura', leaves: ['Constancia', 'Comprensión'] },
  acts: [{ title: 'Las primeras páginas', goal: 'Semana 1: leer 75 páginas.', difficulty: 1 }],
  missions: [
    {
      ...guitarDesign.missions[0],
      title: 'Elige tu libro y lee 20 páginas',
      difficulty: 1,
      skill: 'Constancia',
      steps: ['Elige un libro de menos de 200 páginas', 'Lee 20 páginas sin celular'],
    },
    {
      ...guitarDesign.missions[1],
      title: 'Llega a la página 75',
      difficulty: 2,
      skill: 'Constancia',
      steps: ['Lee 4 sesiones de 20 minutos', 'Anota 3 ideas del libro'],
    },
  ],
  boss: {
    ...guitarDesign.boss,
    title: 'Termina el libro y escribe tu reseña',
    difficulty: 4,
    skill: 'Comprensión',
    steps: ['Lee hasta la última página', 'Escribe una reseña de 100 palabras en tu bitácora'],
  },
  habits: [],
}

/** Una cuenta con algo de todo: campaña a medias, otra completada, hábitos con racha y misión del día. */
async function buildDemo(db: GameDatabase) {
  // Campaña en curso: Acto 1 cerrado (una misión saltada), Acto 2 generado y a medias.
  const guitar = await acceptCampaignPlan(db, guitarDesign, ago(6))
  const [tune, chords, progression] = (await getCampaign(db, guitar.id))!.actViews[0].quests
  await skipSideQuest(db, tune.id, ago(6))
  await completeQuest(db, chords.id, ago(5))
  await addEvidence(
    db,
    { kind: 'sideQuest', id: chords.id },
    { note: 'Em y Am ya suenan limpios; el cambio a 60 bpm me costó dos días.' },
    ago(5),
  )
  await completeQuest(db, progression.id, ago(3))
  const actTwo = (await getCampaign(db, guitar.id))!.actViews[1]
  await addActMissions(db, guitar.id, actTwo.id, actTwoMissions, ago(3))
  const [strum] = (await getCampaign(db, guitar.id))!.actViews[1].quests
  await toggleStep(db, { kind: 'sideQuest', id: strum.id }, 0, ago(1))

  // Campaña terminada, para ver la sección «Completadas» y un jefe derrotado con evidencia.
  const reading = await acceptCampaignPlan(db, readingDesign, ago(14))
  const readingQuests = (await getCampaign(db, reading.id))!.sideQuests
  await completeQuest(db, readingQuests[0].id, ago(13))
  await completeQuest(db, readingQuests[1].id, ago(10))
  await addEvidence(
    db,
    { kind: 'sideQuest', id: readingQuests[2].id },
    { note: 'Reseña: un libro corto que se lee de un tirón; me quedo con la idea de empezar pequeño.' },
    ago(8),
  )
  await completeQuest(db, readingQuests[2].id, ago(8))

  // Hábitos con tres días de racha y uno pendiente hoy.
  const water = await createHabit(
    db,
    { title: 'Tomar 2 litros de agua', difficulty: 1, steps: ['Litro de la mañana', 'Litro de la tarde'] },
    ago(6),
  )
  const [practice] = (await db.habits.toArray()).filter((habit) => habit.id !== water.id)
  for (const days of [3, 2, 1]) {
    await completeHabit(db, water.id, ago(days))
    await completeHabit(db, practice.id, ago(days))
  }
  await completeHabit(db, water.id, ago(0))

  await createSideQuest(
    db,
    { title: 'Ordenar el escritorio', difficulty: 1, steps: ['Tira lo que no uses', 'Limpia la superficie'] },
    ago(2),
  )
  await saveDaily(
    db,
    {
      title: 'Reto relámpago: 60 cambios de acorde',
      difficulty: 2,
      description: 'Cambia entre Em y Am 60 veces con metrónomo a 70 bpm.',
      steps: ['Haz 60 cambios sin detenerte', 'Anota cuántos sonaron limpios'],
      estimate: '20 min',
      skill: 'Ritmo',
      campaignId: guitar.id,
      branchId: guitar.skillId,
    },
    ago(0),
  )

  // Diario: notas de días anteriores (la de hoy queda para escribirla).
  await saveDailyNote(
    db,
    gameDayOf(ago(1)),
    { text: 'Fui al estadio a ver el clásico y ganamos 2 a 1. Gritamos como locos.' },
    ago(1, 22),
  )
  await saveDailyNote(
    db,
    gameDayOf(ago(3)),
    { text: 'Toqué mi primera progresión completa sin detenerme. Se sintió increíble.' },
    ago(3, 21),
  )
  await saveDailyNote(db, gameDayOf(ago(6)), { text: 'Gracias a mi hermano por prestarme su guitarra.' }, ago(6, 23))

  // Recuerdo para Hoy: una nota del mismo día de hace un mes (si ese día existe).
  const monthAgo = new Date(ago(0))
  monthAgo.setMonth(monthAgo.getMonth() - 1)
  if (monthAgo.getDate() === ago(0).getDate()) {
    await saveDailyNote(
      db,
      gameDayOf(monthAgo),
      { text: 'Compré mi primera guitarra. Hoy empieza la aventura.' },
      ago(0),
    )
  }

  await addSleep(db, 14)

  const hud = await getHud(db, gameDayOf(new Date()))
  expect(hud.streak).toBeGreaterThanOrEqual(3)
}

/** Horas de sueño de los últimos `days` días (sin hoy), variadas y repetibles. */
async function addSleep(db: GameDatabase, days: number) {
  const pattern = [7.5, 6, 8, 7, 5.5, 9, 7.5, 6.5, 8, 7, 6, 8.5, 7, 6.5]
  for (let offset = 1; offset <= days; offset++) {
    if (offset % 9 === 0) continue
    await setSleep(db, gameDayOf(ago(offset)), pattern[offset % pattern.length], ago(0))
  }
}

it.runIf(building)('escenario demo', async () => {
  const db = new GameDatabase('escenario-demo')
  await buildDemo(db)
  await exportScenario(db, 'demo')
})

/** La demo con nivel 14: todos los temas, títulos y sonidos desbloqueados. */
it.runIf(building)('escenario temas', async () => {
  const db = new GameDatabase('escenario-temas')
  await buildDemo(db)
  await grantXp(db, 31000)
  expect(await level(db)).toBeGreaterThanOrEqual(12)
  await exportScenario(db, 'temas')
})

/** Campaña con sus dos misiones hechas: solo falta el jefe, que pide evidencia y da el doble de XP. */
it.runIf(building)('escenario jefe', async () => {
  const db = new GameDatabase('escenario-jefe')
  const reading = await acceptCampaignPlan(db, readingDesign, ago(4))
  const [first, second] = (await getCampaign(db, reading.id))!.sideQuests
  await completeQuest(db, first.id, ago(3))
  await completeQuest(db, second.id, ago(1))
  const boss = (await getCampaign(db, reading.id))!.sideQuests.find((quest) => quest.boss)
  expect(boss?.completedDay).toBeNull()
  await exportScenario(db, 'jefe')
})

/** Acto 1 con una sola misión pendiente: al completarla se cierra el acto (celebración y «Generar Acto 2»). */
it.runIf(building)('escenario acto', async () => {
  const db = new GameDatabase('escenario-acto')
  const guitar = await acceptCampaignPlan(db, guitarDesign, ago(4))
  const [tune, chords] = (await getCampaign(db, guitar.id))!.actViews[0].quests
  await completeQuest(db, tune.id, ago(3))
  await completeQuest(db, chords.id, ago(1))
  await exportScenario(db, 'acto')
})

/** Juego en cero, como recién instalado: para el generador de campañas y las pantallas vacías. */
it.runIf(building)('escenario vacio', async () => {
  await exportScenario(new GameDatabase('escenario-vacio'), 'vacio')
})

const AREAS: Record<string, Record<string, string[]>> = {
  Música: {
    Guitarra: ['Fundamentos', 'Acordes abiertos', 'Ritmo', 'Repertorio', 'Cejilla'],
    Piano: ['Postura', 'Escalas', 'Lectura', 'Independencia de manos', 'Acompañamiento'],
  },
  Programación: {
    'Apps Android': ['Interfaz', 'Datos locales', 'Pruebas', 'Publicación', 'Rendimiento'],
    'Diseño web': ['Maquetación', 'Tipografía', 'Color', 'Accesibilidad', 'Animación'],
  },
  Cuerpo: {
    Carrera: ['Resistencia', 'Técnica', 'Velocidad', 'Recuperación', 'Fuerza de piernas'],
    Fútbol: ['Control', 'Pase', 'Definición', 'Desmarque', 'Lectura de juego'],
  },
  Arte: {
    'Retrato a lápiz': ['Control de grafito', 'Anatomía facial', 'Luz y volumen', 'Texturas', 'Parecido'],
    Fotografía: ['Exposición', 'Composición', 'Edición', 'Retrato', 'Luz natural'],
  },
  Mente: {
    Lectura: ['Constancia', 'Comprensión', 'Notas', 'Velocidad lectora', 'Reseñas'],
    Mentalismo: ['Forzajes', 'Lectura en frío', 'Presentación', 'Memoria', 'Rutinas'],
  },
  Vida: {
    Cocina: ['Cortes', 'Salsas', 'Horneado', 'Planeación', 'Emplatado'],
    Finanzas: ['Presupuesto', 'Ahorro', 'Inversión', 'Impuestos', 'Registro de gastos'],
  },
}

/** Árbol grande (78 habilidades en 6 áreas) para medir la fluidez y revisar que nada se encime. */
it.runIf(building)('escenario arbol', async () => {
  const db = new GameDatabase('escenario-arbol')
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000)
  // Dominios variados y repetibles: desde hojas apagadas hasta Maestro.
  const levels = [0, 60, 150, 400, 900, 1600]
  let index = 0

  for (const [area, branches] of Object.entries(AREAS)) {
    for (const [branch, leaves] of Object.entries(branches)) {
      const campaign = await acceptCampaignPlan(
        db,
        {
          ...guitarDesign,
          campaign: `Camino de ${branch}`,
          skills: { area, branch, leaves },
          missions: leaves.map((leaf) => ({
            ...guitarDesign.missions[0],
            title: `Practica ${leaf.toLowerCase()}`,
            skill: leaf,
          })),
          boss: { ...guitarDesign.boss, title: `Prueba final de ${branch}`, skill: leaves[leaves.length - 1] },
          habits: [],
        },
        now,
      )
      for (const quest of (await getCampaign(db, campaign.id))!.actViews[0].quests) {
        const xp = levels[index++ % levels.length]
        if (xp > 0 && quest.skillId) {
          await db.xpEvents.add({
            id: crypto.randomUUID(),
            kind: 'sideQuest',
            taskId: `demo-${quest.id}`,
            day: gameDayOf(now),
            xp,
            skillId: quest.skillId,
          })
        }
      }
    }
  }
  expect(await db.skills.count()).toBe(78)
  await exportScenario(db, 'arbol')
})

/** Lunes de la semana pasada y un día de juego a mediodía. */
const lastWeekStart = () => addDays(weekStartOf(gameDayOf(new Date())), -7)
const noonOf = (day: GameDay) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}

/**
 * La semana pasada, variada: avance en guitarra, una misión saltada, un hábito que casi no se cumplió,
 * una misión atascada y misiones del día hechas y no hechas.
 */
async function buildLastWeek(db: GameDatabase) {
  const start = lastWeekStart()
  const day = (offset: number) => noonOf(addDays(start, offset))
  const water = await createHabit(db, { title: 'Tomar 2 litros de agua', difficulty: 1 }, day(-10))
  const read = await createHabit(
    db,
    { title: 'Leer 20 minutos', difficulty: 1, steps: ['Abre el libro', 'Lee 20 minutos sin celular'] },
    day(-10),
  )
  for (const offset of [-3, -2, -1]) {
    await completeHabit(db, water.id, day(offset))
    await completeHabit(db, read.id, day(offset))
  }
  for (let offset = 0; offset < 7; offset++) await completeHabit(db, water.id, day(offset))
  for (const offset of [0, 3]) await completeHabit(db, read.id, day(offset))

  const guitar = await acceptCampaignPlan(db, { ...guitarDesign, habits: [] }, day(-9))
  const [tune, chords] = (await getCampaign(db, guitar.id))!.actViews[0].quests
  await skipSideQuest(db, tune.id, day(1))
  await completeQuest(db, chords.id, day(4))
  await addEvidence(db, { kind: 'sideQuest', id: chords.id }, { note: 'Em y Am ya suenan limpios.' }, day(4))

  for (const [offset, done] of [
    [2, true],
    [5, false],
  ] as const) {
    await saveDaily(
      db,
      {
        title: done ? 'Reto: 40 cambios de acorde' : 'Reto: afina de oído',
        difficulty: 2,
        description: 'Reto corto.',
        steps: ['Hazlo', 'Anota cómo te fue'],
        estimate: '20 min',
        skill: 'Ritmo',
        campaignId: guitar.id,
        branchId: guitar.skillId,
      },
      day(offset),
    )
    if (done) await db.dailies.update(addDays(start, offset), { completedDay: addDays(start, offset) })
  }
  return { start, read }
}

/** La semana pasada sin revisar: al abrir la tarjeta se genera (en la app de pruebas, con el modelo rápido). */
it.runIf(building)('escenario semana', async () => {
  const db = new GameDatabase('escenario-semana')
  await buildLastWeek(db)
  await exportScenario(db, 'semana')
})

/** La misma semana con una revisión ya guardada: para ver la pantalla y aplicar ajustes sin gastar llamadas. */
it.runIf(building)('escenario revision', async () => {
  const db = new GameDatabase('escenario-revision')
  const { start } = await buildLastWeek(db)
  const report = await getWeekReport(db, start)
  const stuck = report.stuck[0]
  const read = report.habits.find((item) => item.title === 'Leer 20 minutos')!
  expect(stuck).toBeDefined()
  const review = planToReview(
    {
      summary:
        'Semana de avance real en la guitarra: cerraste dos misiones y no soltaste el agua ni un día. La lectura, en cambio, se quedó en 2 de 7 días.',
      wins: ['Tomaste 2 litros de agua los 7 días', 'Completaste «' + report.completed[0].title + '» con evidencia'],
      stuck: [
        {
          ref: stuck.ref,
          title: stuck.title,
          cause: `Lleva ${stuck.days} días desbloqueada: probablemente es demasiado grande para una sola sesión.`,
        },
        { ref: read.ref, title: read.title, cause: 'Solo 2 de 7 días; 20 minutos puede ser mucho al final del día.' },
      ],
      adjustments: [
        {
          kind: 'split',
          ref: stuck.ref,
          reason: 'Partirla en sesiones cortas hace más fácil empezar.',
          parts: [
            {
              title: 'Toca la progresión a 50 bpm',
              difficulty: 1,
              description: 'Solo los cambios, lento.',
              steps: ['5 vueltas sin parar', 'Anota el cambio más difícil'],
            },
            {
              title: 'Toca la progresión a 80 bpm',
              difficulty: 2,
              description: 'Ya con rasgueo.',
              steps: ['5 vueltas sin parar', 'Grábate una vez'],
            },
          ],
        },
        { kind: 'archiveHabit', ref: read.ref, reason: 'Casi no se cumple y te quita la racha.' },
        {
          kind: 'addHabit',
          ref: '',
          reason: 'Un hábito mínimo mantiene la lectura sin presión.',
          habit: { title: 'Leer 1 página', difficulty: 1, steps: ['Abre el libro', 'Lee una página'] },
        },
      ],
      focus: [{ ref: stuck.ref, title: stuck.title, why: 'Es lo único que falta para cerrar el Acto 1.' }],
    },
    report,
    'escenario',
  )
  await saveReview(db, review)
  await exportScenario(db, 'revision')
})

/** El jugador ya existía, pero la semana pasada no hizo nada: la tarjeta muestra el mensaje sin llamar a la IA. */
it.runIf(building)('escenario semana-vacia', async () => {
  const db = new GameDatabase('escenario-semana-vacia')
  await createHabit(db, { title: 'Tomar 2 litros de agua', difficulty: 1 }, noonOf(addDays(lastWeekStart(), -5)))
  await exportScenario(db, 'semana-vacia')
})

/**
 * Libreta llena: 12 hábitos (diarios y de ciertos días) con el mes en curso registrado, incluidos días a medias
 * y no hechos, para ver la cuadrícula con muchas columnas, el cumplimiento y las rachas.
 */
it.runIf(building)('escenario libreta', async () => {
  const db = new GameDatabase('escenario-libreta')
  const today = gameDayOf(new Date())
  const monthStart = `${today.slice(0, 7)}-01`
  const start = addDays(monthStart, -3)
  const habits: Array<[string, string, number[] | null, number]> = [
    ['Tomar 2 litros de agua', '💧', null, 0.95],
    ['Leer 20 minutos', '📚', null, 0.7],
    ['Meditar 10 minutos', '🧘', null, 0.55],
    ['Gimnasio', '🏋️', [0, 2, 4], 0.8],
    ['Correr 5 km', '🏃', [1, 5], 0.6],
    ['Practicar guitarra', '🎸', null, 0.65],
    ['Dormir antes de las 12', '🌙', null, 0.5],
    ['Sin redes antes de las 10', '📵', null, 0.45],
    ['Estudiar inglés', '🇬🇧', [0, 1, 2, 3, 4], 0.75],
    ['Escribir el diario', '✍️', null, 0.4],
    ['Cocinar en casa', '🍳', [5, 6], 0.7],
    ['Llamar a la familia', '📞', [6], 0.9],
  ]
  // Pseudoaleatorio con semilla: el mismo escenario sale igual cada vez.
  let seed = 7
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  for (const [title, emoji, days, odds] of habits) {
    const habit = await createHabit(
      db,
      { title, emoji, difficulty: 1, frequency: days ? { kind: 'weekdays', days } : { kind: 'daily' } },
      noonOf(start),
    )
    for (let day = start; day < today; day = addDays(day, 1)) {
      const roll = random()
      const state = roll < odds ? 'done' : roll < odds + 0.12 ? 'half' : roll < odds + 0.3 ? 'missed' : null
      if (state) await setHabitState(db, habit.id, day, state, noonOf(day))
    }
  }
  await addSleep(db, 30)
  await exportScenario(db, 'libreta')
})
