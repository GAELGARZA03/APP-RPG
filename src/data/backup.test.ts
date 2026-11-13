import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { backupFileName, BackupError, createBackup, parseBackup, restoreBackup, summarizeBackup } from './backup'
import { GameDatabase } from './db'
import { guitarDesign } from '../test/fixtures'
import {
  acceptCampaignPlan,
  addEvidence,
  completeBounty,
  completeDaily,
  completeSideQuest,
  createBounty,
  createCampaign,
  createSideQuest,
  getCampaign,
  getDaily,
  getHud,
  getJournal,
  getMissions,
  getSkillTree,
  saveDaily,
  skipSideQuest,
} from './gameStore'
import {
  getAiSettings,
  getCosmetics,
  getPrefs,
  saveAiModels,
  savePrefs,
  getLastBackupAt,
  getProfile,
  getNotificationSettings,
  saveCosmetics,
  saveNotificationSettings,
  saveProfile,
} from './settings'

const noon = new Date(2026, 10, 7, 12)
const today = gameDayOf(noon)

let source: GameDatabase
let target: GameDatabase
let databaseNumber = 0

beforeEach(() => {
  databaseNumber += 1
  source = new GameDatabase(`backup-source-${databaseNumber}`)
  target = new GameDatabase(`backup-target-${databaseNumber}`)
})

afterEach(async () => {
  await source.delete()
  await target.delete()
})

async function fillSource() {
  const bounty = await createBounty(source, { title: 'Tomar medicamentos', difficulty: 2 }, noon)
  await completeBounty(source, bounty.id, noon)
  const campaign = await createCampaign(source, 'Lanzar la app', noon)
  const quest = await createSideQuest(source, { title: 'Diseñar', difficulty: 3, campaignId: campaign.id }, noon)
  await completeSideQuest(source, quest.id, noon)
  await saveNotificationSettings(source, { enabled: true, night: '23:15' })
  await saveCosmetics(source, { theme: 'amber', sound: 'off' })
  await saveProfile(source, { name: 'Gael', photo: 'data:image/jpeg;base64,AAAA' })
}

describe('Respaldo', () => {
  it('restaura exactamente el mismo progreso en otra instalación', async () => {
    await fillSource()
    const text = JSON.stringify(await createBackup(source, noon))

    await restoreBackup(target, parseBackup(text))

    expect(await getHud(target, today)).toEqual(await getHud(source, today))
    expect(await target.sideQuests.toArray()).toEqual(await source.sideQuests.toArray())
    expect((await getNotificationSettings(target)).night).toBe('23:15')
    expect(await getCosmetics(target)).toMatchObject({ theme: 'amber', sound: 'off' })
    expect(await getProfile(target)).toMatchObject({ name: 'Gael', photo: 'data:image/jpeg;base64,AAAA' })
    expect(await getLastBackupAt(target)).toBe(noon.toISOString())
  })

  it('resume el contenido antes de importarlo', async () => {
    await fillSource()

    expect(summarizeBackup(await createBackup(source, noon))).toEqual({
      exportedAt: noon.toISOString(),
      bounties: 1,
      campaigns: 1,
      sideQuests: 1,
      skills: 0,
      evidence: 0,
      totalXp: 140,
    })
  })

  it('incluye actos, análisis, habilidades, bitácora y misión del día', async () => {
    const campaign = await acceptCampaignPlan(source, guitarDesign, noon)
    const [quest] = (await getCampaign(source, campaign.id))!.sideQuests
    await skipSideQuest(source, quest.id, noon)
    await addEvidence(source, { kind: 'sideQuest', id: quest.id }, { photo: 'data:image/jpeg;base64,AAAA' }, noon)
    await addEvidence(source, { kind: 'sideQuest', id: quest.id }, { note: 'Ya lo sabía' }, noon)
    const daily = await saveDaily(
      source,
      { title: 'Reto', difficulty: 1, steps: ['Uno'], skill: 'Ritmo', branchId: campaign.skillId, campaignId: campaign.id },
      noon,
    )
    await completeDaily(source, daily.id, noon)
    await savePrefs(source, { haptics: false })
    await saveAiModels(target, { mainModel: 'modelo-de-este-telefono' })

    const backup = parseBackup(JSON.stringify(await createBackup(source, noon)))
    expect(backup.version).toBe(2)
    await restoreBackup(target, backup)

    expect(await getCampaign(target, campaign.id)).toEqual(await getCampaign(source, campaign.id))
    expect(await getSkillTree(target)).toEqual(await getSkillTree(source))
    expect(await getJournal(target)).toEqual(await getJournal(source))
    expect(await getDaily(target, today)).toEqual(await getDaily(source, today))
    expect(await getHud(target, today)).toEqual(await getHud(source, today))
    expect((await getPrefs(target)).haptics).toBe(false)
    // Los modelos de IA no viajan en el respaldo: se conservan los del teléfono que importa.
    expect((await getAiSettings(target)).mainModel).toBe('modelo-de-este-telefono')
  })

  it('importa respaldos antiguos (versión 1) como campañas de un solo acto', async () => {
    await fillSource()
    const current = await createBackup(source, noon)
    const { skills: _skills, evidence: _evidence, dailies: _dailies, ...oldData } = current.data
    const old = JSON.stringify({ ...current, version: 1, data: oldData })

    const backup = parseBackup(old)
    await restoreBackup(target, backup)

    expect(backup.data.skills).toEqual([])
    expect(await getHud(target, today)).toEqual(await getHud(source, today))
    const [campaign] = (await getMissions(target)).campaigns
    expect(campaign).toMatchObject({ title: 'Lanzar la app', legacy: true, progress: 100 })
    expect(campaign.sideQuests.every((quest) => quest.lock === null)).toBe(true)
  })

  it('rechaza respaldos con referencias rotas o fotos que no son imágenes', async () => {
    const campaign = await acceptCampaignPlan(source, guitarDesign, noon)
    const [quest] = (await getCampaign(source, campaign.id))!.sideQuests
    await addEvidence(source, { kind: 'sideQuest', id: quest.id }, { photo: 'data:image/jpeg;base64,AAAA' }, noon)
    const backup = JSON.parse(JSON.stringify(await createBackup(source, noon)))

    const orphanAct = structuredClone(backup)
    orphanAct.data.sideQuests[0].actId = 'acto-que-no-existe'
    expect(() => parseBackup(JSON.stringify(orphanAct))).toThrow('incompleto o dañado')

    const orphanSkill = structuredClone(backup)
    orphanSkill.data.skills[1].parentId = 'rama-que-no-existe'
    expect(() => parseBackup(JSON.stringify(orphanSkill))).toThrow('incompleto o dañado')

    const badPhoto = structuredClone(backup)
    badPhoto.data.evidence[0].photo = 'javascript:alert(1)'
    expect(() => parseBackup(JSON.stringify(badPhoto))).toThrow(BackupError)

    const badAct = structuredClone(backup)
    badAct.data.campaigns[0].acts[0].status = 'inventado'
    expect(() => parseBackup(JSON.stringify(badAct))).toThrow(BackupError)
  })

  it('reemplaza los datos que ya había', async () => {
    await createBounty(target, { title: 'Vieja', difficulty: 1 }, noon)
    await fillSource()

    await restoreBackup(target, parseBackup(JSON.stringify(await createBackup(source, noon))))

    expect((await target.bounties.toArray()).map((bounty) => bounty.title)).toEqual(['Tomar medicamentos'])
  })

  it('descarta campos desconocidos', async () => {
    const backup = await createBackup(source, noon)
    const text = JSON.stringify({ ...backup, apiKey: 'secreta', data: { ...backup.data, extra: [1] } })

    expect(JSON.stringify(parseBackup(text))).not.toContain('secreta')
  })

  it('rechaza archivos que no son respaldos', () => {
    expect(() => parseBackup('no es json')).toThrow('no es un respaldo válido')
    expect(() => parseBackup('{"app":"otra"}')).toThrow('no es un respaldo de Real Life RPG')
    expect(() => parseBackup('{"app":"real-life-rpg","version":99}')).toThrow('versión')
  })

  it('rechaza respaldos con datos dañados', async () => {
    await fillSource()
    const backup = await createBackup(source, noon)
    const broken = JSON.parse(JSON.stringify(backup))
    broken.data.bounties[0].difficulty = 7

    expect(() => parseBackup(JSON.stringify(broken))).toThrow(BackupError)
  })

  it('si falla la importación, conserva los datos actuales', async () => {
    await createBounty(target, { title: 'Mía', difficulty: 1 }, noon)
    await fillSource()
    const backup = await createBackup(source, noon)
    backup.data.bounties.push({ ...backup.data.bounties[0] })

    await expect(restoreBackup(target, backup)).rejects.toThrow('no se modificaron')
    expect((await target.bounties.toArray()).map((bounty) => bounty.title)).toEqual(['Mía'])
  })

  it('nombra el archivo con la fecha', () => {
    expect(backupFileName(noon)).toBe('real-life-rpg-2026-11-07.json')
  })
})
