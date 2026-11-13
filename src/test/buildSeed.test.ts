// No es una prueba: genera los datos de demostración que se cargan al teléfono por USB.
// Solo corre con `npm run seed:build`; en `npm test` se omite.
import 'fake-indexeddb/auto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { GameDatabase } from '../data/db'
import {
  acceptCampaignPlan,
  addActMissions,
  addEvidence,
  completeBounty,
  completeQuest,
  createBounty,
  createSideQuest,
  getCampaign,
  getHud,
  saveDaily,
  skipSideQuest,
  toggleStep,
} from '../data/gameStore'
import { gameDayOf } from '../game/gameDay'
import { actTwoMissions, guitarDesign } from './fixtures'

const OUTPUT = 'scripts/telefono/datos-demo.json'
const building = process.env.npm_lifecycle_event === 'seed:build'

it.runIf(building)('genera los datos de demostración', async () => {
  const db = new GameDatabase('seed')
  const ago = (days: number, hour = 12) => {
    // Se parte del día de juego (cierra a las 4:00 a. m.), no del día del calendario.
    const date = new Date(Date.now() - 4 * 60 * 60 * 1000)
    date.setDate(date.getDate() - days)
    date.setHours(hour, 0, 0, 0)
    return date
  }

  // Campaña en curso: Acto 1 cerrado (una misión saltada), Acto 2 generado y a medias.
  const guitar = await acceptCampaignPlan(db, guitarDesign, ago(6))
  const [tune, chords, progression] = (await getCampaign(db, guitar.id))!.actViews[0].quests
  await skipSideQuest(db, tune.id, ago(6))
  await completeQuest(db, chords.id, ago(5))
  await addEvidence(db, { kind: 'sideQuest', id: chords.id }, { note: 'Em y Am ya suenan limpios; el cambio a 60 bpm me costó dos días.' }, ago(5))
  await completeQuest(db, progression.id, ago(3))
  const actTwo = (await getCampaign(db, guitar.id))!.actViews[1]
  await addActMissions(db, guitar.id, actTwo.id, actTwoMissions, ago(3))
  const [strum] = (await getCampaign(db, guitar.id))!.actViews[1].quests
  await toggleStep(db, { kind: 'sideQuest', id: strum.id }, 0, ago(1))

  // Campaña terminada, para ver la sección «Completadas» y un jefe derrotado con evidencia.
  const reading = await acceptCampaignPlan(
    db,
    {
      campaign: 'El lector de medianoche',
      analysis: {
        diagnosis: 'Lees a ratos y sin constancia. Con 20 minutos diarios es realista terminar un libro corto en dos semanas.',
        successCriteria: 'Terminas un libro de 150 páginas y escribes una reseña de 100 palabras.',
        obstacles: [{ obstacle: 'El celular antes de dormir', solution: 'Déjalo cargando fuera del cuarto.' }],
        duration: '2 semanas',
      },
      skills: { area: 'Mente', branch: 'Lectura', leaves: ['Constancia', 'Comprensión'] },
      acts: [{ title: 'Las primeras páginas', goal: 'Semana 1: leer 75 páginas.', difficulty: 1 }],
      missions: [
        { ...guitarDesign.missions[0], title: 'Elige tu libro y lee 20 páginas', difficulty: 1, skill: 'Constancia', steps: ['Elige un libro de menos de 200 páginas', 'Lee 20 páginas sin celular'] },
        { ...guitarDesign.missions[1], title: 'Llega a la página 75', difficulty: 2, skill: 'Constancia', steps: ['Lee 4 sesiones de 20 minutos', 'Anota 3 ideas del libro'] },
      ],
      boss: { ...guitarDesign.boss, title: 'Termina el libro y escribe tu reseña', difficulty: 4, skill: 'Comprensión', steps: ['Lee hasta la última página', 'Escribe una reseña de 100 palabras en tu bitácora'] },
      bounties: [],
    },
    ago(14),
  )
  const readingQuests = (await getCampaign(db, reading.id))!.sideQuests
  await completeQuest(db, readingQuests[0].id, ago(13))
  await completeQuest(db, readingQuests[1].id, ago(10))
  await addEvidence(db, { kind: 'sideQuest', id: readingQuests[2].id }, { note: 'Reseña: un libro corto que se lee de un tirón; me quedo con la idea de empezar pequeño.' }, ago(8))
  await completeQuest(db, readingQuests[2].id, ago(8))

  // Contratos con tres días de racha y uno pendiente hoy.
  const water = await createBounty(db, { title: 'Tomar 2 litros de agua', difficulty: 1, steps: ['Litro de la mañana', 'Litro de la tarde'] }, ago(6))
  const [practice] = (await db.bounties.toArray()).filter((bounty) => bounty.id !== water.id)
  for (const days of [3, 2, 1]) {
    await completeBounty(db, water.id, ago(days))
    await completeBounty(db, practice.id, ago(days))
  }
  await completeBounty(db, water.id, ago(0))

  await createSideQuest(db, { title: 'Ordenar el escritorio', difficulty: 1, steps: ['Tira lo que no uses', 'Limpia la superficie'] }, ago(2))
  await saveDaily(
    db,
    { title: 'Reto relámpago: 60 cambios de acorde', difficulty: 2, description: 'Cambia entre Em y Am 60 veces con metrónomo a 70 bpm.', steps: ['Haz 60 cambios sin detenerte', 'Anota cuántos sonaron limpios'], estimate: '20 min', skill: 'Ritmo', campaignId: guitar.id, branchId: guitar.skillId },
    ago(0),
  )

  const hud = await getHud(db, gameDayOf(new Date()))
  expect(hud.streak).toBeGreaterThanOrEqual(3)

  // La configuración no viaja: al cargar se conserva la del teléfono (llave, modelos, perfil).
  const stores: Record<string, unknown[]> = {}
  for (const table of [db.bounties, db.campaigns, db.sideQuests, db.xpEvents, db.player, db.skills, db.evidence, db.dailies]) {
    stores[table.name] = await table.toArray()
  }
  mkdirSync('scripts/telefono', { recursive: true })
  writeFileSync(OUTPUT, JSON.stringify({ app: 'real-life-rpg', kind: 'volcado', createdAt: new Date().toISOString(), stores }, null, 1))
  await db.delete()
})
