import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { actTwoMissions, guitarDesign } from '../test/fixtures'
import { GameDatabase, type Setting } from './db'
import {
  acceptCampaignPlan,
  addActMissions,
  addEvidence,
  completeBounty,
  completeDaily,
  completeQuest,
  createBounty,
  createCampaign,
  createSideQuest,
  deleteCampaign,
  getActReport,
  getAiContext,
  getCampaign,
  getDaily,
  getDailyContext,
  getHud,
  getJournal,
  getSkillDetail,
  getSkillTree,
  getTaskDetail,
  getTodayBounties,
  resetProgress,
  saveDaily,
  skipSideQuest,
  toggleStep,
  undoSideQuest,
  updateSideQuest,
} from './gameStore'
import { getAiSettings } from './settings'

const day = (offset: number, hour = 12) => new Date(2026, 10, 2 + offset, hour)
const PHOTO = 'data:image/jpeg;base64,AAAA'

let db: GameDatabase
let databaseNumber = 0

beforeEach(() => {
  databaseNumber += 1
  db = new GameDatabase(`progression-${databaseNumber}`)
})

afterEach(async () => {
  await db.delete()
})

async function guitar() {
  const campaign = await acceptCampaignPlan(db, { ...guitarDesign, bounties: [] }, day(0))
  return (await getCampaign(db, campaign.id))!
}

const view = async (id: string) => (await getCampaign(db, id))!
const xp = async () => (await getHud(db, gameDayOf(day(0)))).totalXp

/** Completa todas las misiones del acto actual (menos el jefe). */
async function clearCurrentAct(campaignId: string, when = day(1)) {
  const campaign = await view(campaignId)
  const act = campaign.actViews[campaign.currentAct! - 1]
  let outcome
  for (const quest of act.quests.filter((quest) => !quest.boss && quest.completedDay === null)) {
    outcome = await completeQuest(db, quest.id, when)
  }
  return outcome
}

describe('Crear una campaña diseñada', () => {
  it('crea actos, misiones del Acto 1, jefe y habilidades de una sola vez', async () => {
    const campaign = await guitar()

    expect(campaign.actViews.map((act) => [act.title, act.status, act.state])).toEqual([
      ['Primeros acordes', 'ready', 'current'],
      ['Ritmo y cambios', 'planned', 'locked'],
      ['El concierto', 'planned', 'locked'],
    ])
    expect(campaign.actViews[0].quests).toHaveLength(3)
    expect(campaign.actViews[2].quests.map((quest) => [quest.title, quest.boss])).toEqual([['El concierto', true]])
    expect(campaign.analysis?.duration).toBe('12 semanas')

    const tree = await getSkillTree(db)
    expect(tree.nodes.map((node) => `${node.depth}:${node.name}`)).toEqual([
      '1:Música',
      '2:Guitarra',
      '3:Fundamentos',
      '3:Acordes abiertos',
      '3:Ritmo',
      '3:Repertorio',
    ])
  })

  it('crea los contratos aceptados con su habilidad', async () => {
    await acceptCampaignPlan(db, guitarDesign, day(0))
    const [bounty] = await getTodayBounties(db, gameDayOf(day(0)))

    expect(bounty.title).toBe('Practica cambios de acordes 10 minutos')
    await completeBounty(db, bounty.id, day(0))
    const tree = await getSkillTree(db)
    expect(tree.nodes.find((node) => node.name === 'Acordes abiertos')?.xp).toBe(20)
  })

  it('reutiliza ramas existentes aunque la IA las escriba distinto', async () => {
    await guitar()
    await acceptCampaignPlan(
      db,
      {
        ...guitarDesign,
        campaign: 'Otra',
        bounties: [],
        skills: { area: 'MUSICA', branch: 'guitarra', leaves: ['ritmo', 'Solos'] },
      },
      day(0),
    )

    const names = (await getSkillTree(db)).nodes.map((node) => node.name)
    expect(names.filter((name) => /m[uú]sica/i.test(name))).toHaveLength(1)
    expect(names.filter((name) => /ritmo/i.test(name))).toHaveLength(1)
    expect(names).toContain('Solos')
  })

  it('si algo falla al crear, no queda nada a medias', async () => {
    // Se fuerza un fallo a mitad de la transacción: la campaña nueva choca con una llave que ya existe.
    await db.campaigns.add({ id: 'x', title: 'Previa', createdAt: 1, createdDay: '2026-11-02' })
    const original = crypto.randomUUID
    let calls = 0
    crypto.randomUUID = () => {
      calls += 1
      // Las primeras llamadas crean habilidades; después llega la campaña con la llave repetida.
      return (calls > 6 ? 'x' : `skill-${calls}`) as ReturnType<typeof crypto.randomUUID>
    }
    try {
      await expect(acceptCampaignPlan(db, guitarDesign, day(0))).rejects.toThrow()
    } finally {
      crypto.randomUUID = original
    }

    expect(await db.campaigns.count()).toBe(1)
    expect(await db.sideQuests.count()).toBe(0)
    expect(await db.skills.count()).toBe(0)
    expect(await db.bounties.count()).toBe(0)
  })
})

describe('Actos y bloqueo', () => {
  it('solo el primer acto sin terminar está desbloqueado', async () => {
    const campaign = await guitar()
    const boss = campaign.sideQuests.find((quest) => quest.boss)!

    expect(campaign.actViews[0].quests.every((quest) => quest.lock === null)).toBe(true)
    expect(boss.lock).toBe('Completa el Acto 1 para desbloquear')
    expect(await completeQuest(db, boss.id, day(0))).toMatchObject({ ok: false, blocked: 'locked' })
    expect(await skipSideQuest(db, boss.id, day(0))).toMatchObject({ ok: false })
    expect(await toggleStep(db, { kind: 'sideQuest', id: boss.id }, 0, day(0))).toMatchObject({ blocked: 'locked' })
    expect(await xp()).toBe(0)
  })

  it('las misiones del acto actual se hacen en cualquier orden', async () => {
    const campaign = await guitar()
    const [first, , third] = campaign.actViews[0].quests

    expect(await completeQuest(db, third.id, day(0))).toMatchObject({ ok: true, xp: 90 })
    expect(await completeQuest(db, first.id, day(0))).toMatchObject({ ok: true, xp: 20 })
  })

  it('completar el acto lo anuncia y desbloquea el siguiente', async () => {
    const campaign = await guitar()
    const outcome = await clearCurrentAct(campaign.id)

    expect(outcome?.act).toEqual({
      campaignId: campaign.id,
      campaignTitle: 'Del silencio al escenario',
      actNumber: 1,
      actTitle: 'Primeros acordes',
      next: { number: 2, title: 'Ritmo y cambios', planned: true },
    })
    const after = await view(campaign.id)
    expect(after.actViews.map((act) => act.state)).toEqual(['done', 'current', 'locked'])
    expect(after.currentAct).toBe(2)
  })

  it('una misión saltada cuenta para avanzar pero no da XP, y se puede deshacer', async () => {
    const campaign = await guitar()
    const [first, second, third] = campaign.actViews[0].quests

    expect(await skipSideQuest(db, first.id, day(0))).toMatchObject({ ok: true, xp: 0 })
    await completeQuest(db, second.id, day(0))
    const outcome = await skipSideQuest(db, third.id, day(0))

    expect(outcome.act?.actNumber).toBe(1)
    expect(await xp()).toBe(50)
    expect(await db.xpEvents.count()).toBe(1)
    // 20 + 50 + 90 resueltos de 20 + 50 + 90 + 400 (el jefe vale doble).
    expect((await view(campaign.id)).progress).toBe(Math.round((160 / 560) * 100))

    expect(await undoSideQuest(db, first.id)).toBe(true)
    expect((await view(campaign.id)).currentAct).toBe(1)
    expect(await xp()).toBe(50)
  })

  it('deshacer una misión de un acto cerrado vuelve a bloquear lo siguiente sin tocar su XP', async () => {
    const campaign = await guitar()
    await clearCurrentAct(campaign.id)
    await addActMissions(db, campaign.id, campaign.actViews[1].id, actTwoMissions, day(2))
    const actTwo = (await view(campaign.id)).actViews[1]
    await completeQuest(db, actTwo.quests[0].id, day(2))
    expect(await xp()).toBe(160 + 90)

    await undoSideQuest(db, campaign.actViews[0].quests[0].id)

    const after = await view(campaign.id)
    expect(after.actViews.map((act) => act.state)).toEqual(['current', 'locked', 'locked'])
    expect(after.actViews[1].quests[1].lock).toBe('Completa el Acto 1 para desbloquear')
    expect(await completeQuest(db, after.actViews[1].quests[1].id, day(2))).toMatchObject({ blocked: 'locked' })
    // Se pierde solo el XP de la misión deshecha; lo ganado en el Acto 2 se conserva.
    expect(await xp()).toBe(160 + 90 - 20)

    await completeQuest(db, campaign.actViews[0].quests[0].id, day(3))
    expect((await view(campaign.id)).currentAct).toBe(2)
    expect(await xp()).toBe(160 + 90)
  })

  it('las campañas antiguas quedan en un solo acto sin bloqueo ni jefe', async () => {
    const campaign = await createCampaign(db, 'Antigua', day(0))
    const quest = await createSideQuest(db, { title: 'Paso', difficulty: 2, campaignId: campaign.id }, day(0))
    const legacy = await view(campaign.id)

    expect(legacy.legacy).toBe(true)
    expect(legacy.actViews).toHaveLength(1)
    expect(legacy.sideQuests.every((item) => item.lock === null && !item.boss)).toBe(true)
    expect(await completeQuest(db, quest.id, day(0))).toMatchObject({ ok: true, xp: 50 })
    expect((await getTaskDetail(db, { kind: 'sideQuest', id: quest.id }, gameDayOf(day(0))))?.actLabel).toBeNull()
  })

  it('una misión manual entra al acto en curso', async () => {
    const campaign = await guitar()
    await clearCurrentAct(campaign.id)
    const manual = await createSideQuest(db, { title: 'Manual', difficulty: 1, campaignId: campaign.id }, day(2))

    const after = await view(campaign.id)
    expect(manual.actId).toBe(campaign.actViews[1].id)
    // Sin IA, agregar una misión a mano deja listo el acto pendiente.
    expect(after.actViews[1].status).toBe('ready')
  })
})

describe('Generación acto por acto', () => {
  it('guarda las misiones del acto actual una sola vez', async () => {
    const campaign = await guitar()
    const actTwoId = campaign.actViews[1].id

    // El Acto 2 aún no es el actual: no se aceptan misiones.
    expect(await addActMissions(db, campaign.id, actTwoId, actTwoMissions, day(1))).toBe(false)

    await clearCurrentAct(campaign.id)
    expect(await addActMissions(db, campaign.id, actTwoId, actTwoMissions, day(2))).toBe(true)
    // Una respuesta repetida (doble toque, reintento tardío) no duplica nada.
    expect(await addActMissions(db, campaign.id, actTwoId, actTwoMissions, day(2))).toBe(false)

    const after = await view(campaign.id)
    expect(after.actViews[1].quests.map((quest) => quest.title)).toEqual(actTwoMissions.map((mission) => mission.title))
    expect(after.actViews[1].status).toBe('ready')
    expect(await addActMissions(db, 'no-existe', actTwoId, actTwoMissions)).toBe(false)
  })

  it('resume cómo le fue al jugador para diseñar el siguiente acto', async () => {
    const campaign = await guitar()
    const [first, second, third] = campaign.actViews[0].quests
    expect(await getActReport(db, campaign.id)).toBeNull()

    await skipSideQuest(db, first.id, day(1))
    await completeQuest(db, second.id, day(2))
    await undoSideQuest(db, second.id)
    await completeQuest(db, second.id, day(3))
    await completeQuest(db, third.id, day(4))

    const report = (await getActReport(db, campaign.id))!
    expect(report.next.number).toBe(2)
    expect(report.boss?.title).toBe('El concierto')
    expect(report.previous).toEqual([
      {
        number: 1,
        title: 'Primeros acordes',
        days: 4,
        missions: [
          { title: first.title, difficulty: 1, skipped: true, undone: 0 },
          { title: second.title, difficulty: 2, skipped: false, undone: 1 },
          { title: third.title, difficulty: 3, skipped: false, undone: 0 },
        ],
      },
    ])
  })
})

describe('Misión jefe', () => {
  async function reachBoss() {
    const campaign = await guitar()
    await clearCurrentAct(campaign.id)
    await addActMissions(db, campaign.id, campaign.actViews[1].id, actTwoMissions, day(2))
    await clearCurrentAct(campaign.id, day(3))
    return { campaign, boss: campaign.sideQuests.find((quest) => quest.boss)! }
  }

  it('espera a que se genere su acto y a que se completen las demás misiones', async () => {
    const { campaign, boss } = await reachBoss()
    expect((await view(campaign.id)).sideQuests.find((quest) => quest.boss)?.lock).toBe(
      'Genera las misiones del Acto 3 para llegar al jefe',
    )

    await addActMissions(db, campaign.id, campaign.actViews[2].id, [actTwoMissions[0]], day(4))
    expect((await view(campaign.id)).sideQuests.find((quest) => quest.boss)?.lock).toBe(
      'Completa las demás misiones del acto para enfrentar al jefe',
    )
    expect(await completeQuest(db, boss.id, day(4))).toMatchObject({ blocked: 'locked' })
  })

  it('pide evidencia, da el doble de XP y cierra la campaña', async () => {
    const { campaign, boss } = await reachBoss()
    await addActMissions(db, campaign.id, campaign.actViews[2].id, [actTwoMissions[0]], day(4))
    await clearCurrentAct(campaign.id, day(5))
    const before = await xp()

    expect(await completeQuest(db, boss.id, day(6))).toEqual({ ok: false, xp: 0, blocked: 'evidence', boss: true })
    await addEvidence(db, { kind: 'sideQuest', id: boss.id }, { note: 'Toqué para mi familia' }, day(6))
    const outcome = await completeQuest(db, boss.id, day(6))

    expect(outcome).toMatchObject({ ok: true, xp: 400, boss: true })
    expect(outcome.act).toMatchObject({ actNumber: 3, next: null })
    expect(await xp()).toBe(before + 400)
    const done = await view(campaign.id)
    expect(done.currentAct).toBeNull()
    expect(done.progress).toBe(100)
  })

  it('deshacer al jefe quita su XP una sola vez y reabre el acto', async () => {
    const { campaign, boss } = await reachBoss()
    await addActMissions(db, campaign.id, campaign.actViews[2].id, [actTwoMissions[0]], day(4))
    await clearCurrentAct(campaign.id, day(5))
    await addEvidence(db, { kind: 'sideQuest', id: boss.id }, { photo: PHOTO }, day(6))
    const before = await xp()
    await completeQuest(db, boss.id, day(6))

    expect(await undoSideQuest(db, boss.id)).toBe(true)
    expect(await undoSideQuest(db, boss.id)).toBe(false)
    expect(await xp()).toBe(before)
    expect((await view(campaign.id)).currentAct).toBe(3)

    // Deshacer otra misión del acto vuelve a bloquear al jefe.
    await undoSideQuest(db, (await view(campaign.id)).actViews[2].quests[0].id)
    expect(await completeQuest(db, boss.id, day(7))).toMatchObject({ blocked: 'locked' })
  })
})

describe('Objetivos marcables', () => {
  it('marcar el último objetivo completa la misión y desmarcar la deshace', async () => {
    const quest = await createSideQuest(db, { title: 'Leer', difficulty: 2, steps: ['Uno', 'Dos'] }, day(0))
    const ref = { kind: 'sideQuest' as const, id: quest.id }

    expect(await toggleStep(db, ref, 0, day(0))).toEqual({ ok: true, xp: 0 })
    expect((await db.sideQuests.get(quest.id))?.stepsDone).toEqual([0])
    expect(await toggleStep(db, ref, 1, day(0))).toMatchObject({ ok: true, xp: 50 })
    expect((await db.sideQuests.get(quest.id))?.completedDay).not.toBeNull()

    expect(await toggleStep(db, ref, 0, day(0))).toEqual({ ok: true, xp: 0 })
    const after = (await db.sideQuests.get(quest.id))!
    expect(after.completedDay).toBeNull()
    expect(after.stepsDone).toEqual([1])
    expect(await xp()).toBe(0)
    expect(await toggleStep(db, ref, 9, day(0))).toMatchObject({ ok: false })
  })

  it('completar con el botón marca todos los objetivos', async () => {
    const quest = await createSideQuest(db, { title: 'Leer', difficulty: 2, steps: ['Uno', 'Dos'] }, day(0))
    await completeQuest(db, quest.id, day(0))
    expect((await db.sideQuests.get(quest.id))?.stepsDone).toEqual([0, 1])

    await updateSideQuest(db, quest.id, { steps: ['Uno', 'Dos', 'Tres'] })
    expect((await db.sideQuests.get(quest.id))?.stepsDone).toEqual([0, 1, 2])
  })

  it('los objetivos de un contrato se reinician al cerrar el día', async () => {
    const bounty = await createBounty(db, { title: 'Estirar', difficulty: 1, steps: ['Cuello', 'Espalda'] }, day(0))
    const ref = { kind: 'bounty' as const, id: bounty.id }

    await toggleStep(db, ref, 0, day(0))
    expect((await getTodayBounties(db, gameDayOf(day(0))))[0].stepsDoneToday).toBe(1)
    // A las 3:00 a. m. del día siguiente sigue siendo el mismo día de juego.
    expect((await getTodayBounties(db, gameDayOf(day(1, 3))))[0].stepsDoneToday).toBe(1)
    expect(await toggleStep(db, ref, 1, day(1, 3))).toMatchObject({ ok: true, xp: 20 })

    // Tras las 4:00 a. m. las casillas empiezan vacías y el contrato vuelve a estar pendiente.
    const [next] = await getTodayBounties(db, gameDayOf(day(1, 5)))
    expect(next).toMatchObject({ stepsDoneToday: 0, doneToday: false })
    expect((await getTaskDetail(db, ref, gameDayOf(day(1, 5))))?.stepsDone).toEqual([])
    await toggleStep(db, ref, 0, day(1, 5))
    expect((await getTaskDetail(db, ref, gameDayOf(day(1, 5))))?.stepsDone).toEqual([0])
    expect(await db.xpEvents.count()).toBe(1)
  })

  it('el jefe con todos los objetivos marcados espera la evidencia', async () => {
    const campaign = await acceptCampaignPlan(
      db,
      { ...guitarDesign, acts: [guitarDesign.acts[0]], bounties: [] },
      day(0),
    )
    await clearCurrentAct(campaign.id)
    const boss = (await view(campaign.id)).sideQuests.find((quest) => quest.boss)!
    const ref = { kind: 'sideQuest' as const, id: boss.id }

    await toggleStep(db, ref, 0, day(1))
    expect(await toggleStep(db, ref, 1, day(1))).toMatchObject({ ok: false, blocked: 'evidence' })
    expect((await db.sideQuests.get(boss.id))?.stepsDone).toEqual([0, 1])
    expect((await db.sideQuests.get(boss.id))?.completedDay).toBeNull()
  })
})

describe('Árbol de habilidades', () => {
  it('cada misión suma su XP a su habilidad y las ramas suman sus sub-ramas', async () => {
    const campaign = await guitar()
    await clearCurrentAct(campaign.id)

    const tree = await getSkillTree(db)
    const xpOf = (name: string) => tree.nodes.find((node) => node.name === name)?.xp
    expect(xpOf('Fundamentos')).toBe(20)
    expect(xpOf('Acordes abiertos')).toBe(50)
    expect(xpOf('Ritmo')).toBe(90)
    expect(xpOf('Repertorio')).toBe(0)
    expect(xpOf('Guitarra')).toBe(160)
    expect(xpOf('Música')).toBe(160)
    expect(tree.totalXp).toBe(160)

    const guitarNode = tree.nodes.find((node) => node.name === 'Guitarra')!
    const detail = (await getSkillDetail(db, guitarNode.id))!
    expect(detail.path).toBe('Música › Guitarra')
    expect(detail.xp).toBe(160)
    expect(detail.missions.map((mission) => mission.title)).toEqual([
      'Tu primera progresión',
      'Domina Mi menor y La menor',
      'Afina tu guitarra y conoce sus cuerdas',
    ])
    expect(detail.skill.origin).toBe('Del silencio al escenario')
  })

  it('deshacer una misión le quita el XP a su habilidad', async () => {
    const campaign = await guitar()
    const quest = campaign.actViews[0].quests[2]
    await completeQuest(db, quest.id, day(0))
    await undoSideQuest(db, quest.id)

    expect((await getSkillTree(db)).totalXp).toBe(0)
  })

  it('borrar una campaña se lleva misiones, evidencias, su rama del árbol y sus contratos, pero no el XP', async () => {
    const created = await acceptCampaignPlan(db, guitarDesign, day(0))
    const campaign = await view(created.id)
    const quest = campaign.actViews[0].quests[0]
    await completeQuest(db, quest.id, day(0))
    await addEvidence(db, { kind: 'sideQuest', id: quest.id }, { photo: PHOTO }, day(0))
    const own = await createBounty(db, { title: 'Mío', difficulty: 1 }, day(0))
    const [linked] = (await getTodayBounties(db, gameDayOf(day(0)))).filter((bounty) => bounty.id !== own.id)
    await completeBounty(db, linked.id, day(0))

    await deleteCampaign(db, campaign.id, day(1))

    expect(await db.campaigns.count()).toBe(0)
    expect(await db.sideQuests.count()).toBe(0)
    expect(await db.evidence.count()).toBe(0)
    // El contrato que nació con la campaña se archiva; el que creó el jugador sigue activo.
    expect((await getTodayBounties(db, gameDayOf(day(1)))).map((bounty) => bounty.title)).toEqual(['Mío'])
    expect((await db.bounties.get(linked.id))?.archivedDay).toBe(gameDayOf(day(1)))
    // El XP y el nivel se conservan, pero el árbol queda limpio.
    expect(await xp()).toBe(40)
    expect(await getSkillTree(db)).toEqual({ nodes: [], totalXp: 0 })
    expect((await db.xpEvents.toArray()).every((event) => event.skillId === undefined)).toBe(true)
  })

  it('borrar una campaña no toca la rama que comparte con otra ni sus sub-ramas sin XP', async () => {
    const first = await guitar()
    const second = await acceptCampaignPlan(db, { ...guitarDesign, campaign: 'Guitarra II', bounties: [] }, day(0))
    const other = await acceptCampaignPlan(
      db,
      { ...guitarDesign, campaign: 'Dibujo', bounties: [], skills: { area: 'Arte', branch: 'Retrato', leaves: ['Sombras', 'Texturas'] } },
      day(0),
    )
    await completeQuest(db, first.actViews[0].quests[0].id, day(0))

    await deleteCampaign(db, first.id)
    // «Guitarra» sigue porque otra campaña la usa; «Arte» conserva hasta sus hojas apagadas.
    let names = (await getSkillTree(db)).nodes.map((node) => node.name)
    expect(names).toEqual(expect.arrayContaining(['Música', 'Guitarra', 'Fundamentos', 'Arte', 'Retrato', 'Texturas']))
    expect((await getSkillTree(db)).totalXp).toBe(20)

    await deleteCampaign(db, second.id)
    names = (await getSkillTree(db)).nodes.map((node) => node.name)
    expect(names).not.toContain('Música')
    expect(names).toEqual(expect.arrayContaining(['Arte', 'Retrato', 'Sombras', 'Texturas']))
    expect((await getCampaign(db, other.id))?.title).toBe('Dibujo')
  })
})

describe('Restablecer progreso', () => {
  async function playABit() {
    const campaign = await acceptCampaignPlan(db, guitarDesign, day(0))
    const quest = (await view(campaign.id)).actViews[0].quests[0]
    await completeQuest(db, quest.id, day(0))
    await addEvidence(db, { kind: 'sideQuest', id: quest.id }, { note: 'Listo' }, day(0))
    await saveDaily(db, { title: 'Reto', difficulty: 1 }, day(0))
    const mine = await createBounty(db, { title: 'Tomar agua', difficulty: 1, steps: ['Uno', 'Dos'] }, day(0))
    const archived = await createBounty(db, { title: 'Vieja', difficulty: 1 }, day(0))
    await toggleStep(db, { kind: 'bounty', id: mine.id }, 0, day(0))
    await completeBounty(db, archived.id, day(0))
    await db.bounties.update(archived.id, { archivedDay: gameDayOf(day(0)) })
    const settings: Setting[] = [
      { id: 'cosmetics', theme: 'amber', title: 'explorer', sound: 'arcade', crt: true },
      { id: 'profile', name: 'Gael', photo: null },
      { id: 'ai', fastModel: 'rapido', mainModel: 'principal' },
      { id: 'notifications', enabled: true, morning: '08:00', afternoon: '15:00', night: '22:30', weeklyBackupReminder: true },
    ]
    await db.settings.bulkPut(settings)
  }

  it('deja el juego en cero y vuelve a bloquear lo desbloqueado, sin tocar la configuración', async () => {
    await playABit()

    await resetProgress(db, { keepBounties: false })

    for (const table of [db.campaigns, db.sideQuests, db.xpEvents, db.skills, db.evidence, db.dailies, db.bounties, db.player]) {
      expect(await table.count()).toBe(0)
    }
    expect(await getHud(db, gameDayOf(day(0)))).toMatchObject({ level: 1, totalXp: 0, streak: 0, completedTasks: 0 })
    // Sin XP el nivel es 1, y la elección de tema, título y sonido vuelve a la inicial.
    expect(await db.settings.get('cosmetics')).toBeUndefined()
    expect(await db.settings.get('profile')).toMatchObject({ name: 'Gael' })
    expect(await getAiSettings(db)).toMatchObject({ fastModel: 'rapido', mainModel: 'principal' })
    expect(await db.settings.get('notifications')).toMatchObject({ enabled: true })
  })

  it('puede conservar los contratos activos, ya sin historial ni enlaces', async () => {
    await playABit()

    await resetProgress(db, { keepBounties: true })

    const bounties = await db.bounties.toArray()
    expect(bounties.map((bounty) => bounty.title).sort()).toEqual(['Practica cambios de acordes 10 minutos', 'Tomar agua'])
    expect(bounties.every((bounty) => !bounty.skillId && !bounty.campaignId && !bounty.stepsDone)).toBe(true)
    expect(await db.xpEvents.count()).toBe(0)
    expect((await getTodayBounties(db, gameDayOf(day(0)))).every((bounty) => !bounty.doneToday)).toBe(true)
  })
})

describe('Bitácora', () => {
  it('guarda fotos y notas con límite por misión, de la más reciente a la más antigua', async () => {
    const campaign = await guitar()
    const quest = campaign.actViews[0].quests[0]
    const ref = { kind: 'sideQuest' as const, id: quest.id }

    await addEvidence(db, ref, { note: '  Primera nota  ' }, day(0))
    for (let index = 0; index < 5; index += 1) {
      const added = await addEvidence(db, ref, { photo: PHOTO }, day(1, 10 + index))
      expect(added === null).toBe(index >= 4)
    }
    expect(await addEvidence(db, ref, { note: '   ' }, day(1))).toBeNull()
    expect(await addEvidence(db, { kind: 'sideQuest', id: 'no-existe' }, { note: 'x' }, day(1))).toBeNull()

    const journal = await getJournal(db)
    expect(journal).toHaveLength(5)
    expect(journal[4]).toMatchObject({
      note: 'Primera nota',
      taskTitle: quest.title,
      campaign: 'Del silencio al escenario',
    })
    expect(journal[0].createdAt).toBeGreaterThan(journal[1].createdAt)
    expect((await getTaskDetail(db, ref, gameDayOf(day(1))))?.evidence).toHaveLength(5)
  })
})

describe('Misión del día', () => {
  const plan = { title: 'Reto relámpago', difficulty: 2 as const, description: 'Hazlo.', steps: ['Uno'], skill: 'Ritmo' }

  it('se liga al acto actual y a las habilidades de la campaña', async () => {
    const campaign = await guitar()
    const context = (await getDailyContext(db, gameDayOf(day(0))))!

    expect(context).toMatchObject({ campaignId: campaign.id, act: { number: 1, title: 'Primeros acordes' } })
    expect(context.pending).toHaveLength(3)
    expect(context.skills).toEqual(['Fundamentos', 'Acordes abiertos', 'Ritmo', 'Repertorio'])
  })

  it('sin campañas activas ni habilidades no hay de dónde generarla', async () => {
    expect(await getDailyContext(db, gameDayOf(day(0)))).toBeNull()
  })

  it('hay una sola por día de juego, da XP extra y no afecta la racha', async () => {
    const campaign = await guitar()
    const bounty = await createBounty(db, { title: 'Agua', difficulty: 1 }, day(0))
    const first = await saveDaily(db, { ...plan, campaignId: campaign.id, branchId: campaign.skillId }, day(0))
    const second = await saveDaily(db, { ...plan, title: 'Otra' }, day(0, 20))

    expect(second.title).toBe('Reto relámpago')
    expect(await db.dailies.count()).toBe(1)

    expect(await completeDaily(db, first.id, day(0))).toEqual({ ok: true, xp: 75 })
    expect(await completeDaily(db, first.id, day(0))).toMatchObject({ ok: false })
    expect((await getSkillTree(db)).nodes.find((node) => node.name === 'Ritmo')?.xp).toBe(75)

    // Hacerla no cumple el día: la racha depende solo de los contratos.
    expect((await getHud(db, gameDayOf(day(0)))).todayFulfilled).toBe(false)
    await completeBounty(db, bounty.id, day(0))
    expect((await getHud(db, gameDayOf(day(1)))).streak).toBe(1)
  })

  it('caduca al cierre del día y la siguiente la reemplaza', async () => {
    await guitar()
    const first = await saveDaily(db, plan, day(0))

    expect(await getDaily(db, gameDayOf(day(1, 3)))).not.toBeNull()
    expect(await getDaily(db, gameDayOf(day(1, 5)))).toBeNull()
    expect(await completeDaily(db, first.id, day(1, 5))).toMatchObject({ ok: false, blocked: 'locked' })
    expect(await toggleStep(db, { kind: 'daily', id: first.id }, 0, day(1, 5))).toMatchObject({ ok: false })

    await saveDaily(db, { ...plan, title: 'Nueva' }, day(1, 5))
    expect((await db.dailies.toArray()).map((daily) => daily.title)).toEqual(['Nueva'])
  })
})

describe('Contexto para la IA', () => {
  it('solo incluye campañas activas, contratos, nivel y racha', async () => {
    await guitar()
    await createCampaign(db, 'Vacía', day(0))
    await createBounty(db, { title: 'Agua', difficulty: 1 }, day(0))

    const context = await getAiContext(db, gameDayOf(day(0)))
    expect(context).toMatchObject({ level: 1, streak: 0, bounties: ['Agua'] })
    expect(context.campaigns).toEqual([{ title: 'Del silencio al escenario', skill: 'Música › Guitarra' }])
    expect(context.skillPaths).toContain('Música › Guitarra › Ritmo')
  })
})

describe('Migración del esquema', () => {
  it('abre datos de la versión 2 sin perder nada y los trata como Acto 1', async () => {
    const name = `migracion-${databaseNumber}`
    const old = new Dexie(name)
    old.version(1).stores({
      bounties: 'id',
      campaigns: 'id',
      sideQuests: 'id, campaignId',
      xpEvents: 'id, &[taskId+day], taskId, day',
      player: 'id',
    })
    old.version(2).stores({ settings: 'id' })
    await old.table('bounties').add({
      id: 'b',
      title: 'Medicamentos',
      difficulty: 2,
      createdAt: 1,
      createdDay: '2026-11-01',
      archivedDay: null,
    })
    await old.table('campaigns').add({ id: 'c', title: 'El Despertar del Mago', createdAt: 2, createdDay: '2026-11-01' })
    await old.table('sideQuests').bulkAdd([
      { id: 'q1', title: 'Mazo', difficulty: 1, campaignId: 'c', createdAt: 3, createdDay: '2026-11-01', completedDay: '2026-11-01' },
      { id: 'q2', title: 'Cortes', difficulty: 2, campaignId: 'c', createdAt: 4, createdDay: '2026-11-01', completedDay: null, steps: ['a', 'b'] },
    ])
    await old.table('xpEvents').bulkAdd([
      { id: 'e1', kind: 'sideQuest', taskId: 'q1', day: '2026-11-01', xp: 20 },
      { id: 'e2', kind: 'bounty', taskId: 'b', day: '2026-11-01', xp: 50 },
    ])
    await old.table('player').add({ id: 'player', streak: 3, lastSettledDay: '2026-11-01' })
    await old.table('settings').bulkAdd([
      { id: 'ai', model: 'gemini-3.8-flash' },
      { id: 'profile', name: 'Gael', photo: null },
    ])
    old.close()

    const migrated = new GameDatabase(name)
    try {
      expect(await getHud(migrated, '2026-11-02')).toMatchObject({ totalXp: 70, completedTasks: 2 })
      expect(await migrated.bounties.count()).toBe(1)
      expect(await getAiSettings(migrated)).toMatchObject({
        fastModel: 'gemini-3.8-flash',
        mainModel: 'gemini-4-hydrogen',
      })
      expect(await migrated.settings.get('profile')).toMatchObject({ name: 'Gael' })

      const campaign = (await getCampaign(migrated, 'c'))!
      expect(campaign).toMatchObject({ legacy: true, progress: 29, currentAct: 1 })
      expect(campaign.sideQuests.map((quest) => quest.lock)).toEqual([null, null])
      expect(await completeQuest(migrated, 'q2', new Date(2026, 10, 2, 12))).toMatchObject({ ok: true, xp: 50 })
      expect((await getSkillTree(migrated)).nodes).toEqual([])
    } finally {
      await migrated.delete()
    }
  })
})
