import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gameDayOf } from '../game/gameDay'
import { backupFileName, BackupError, createBackup, parseBackup, restoreBackup, summarizeBackup } from './backup'
import { GameDatabase } from './db'
import {
  completeBounty,
  completeSideQuest,
  createBounty,
  createCampaign,
  createSideQuest,
  getHud,
} from './gameStore'
import { getLastBackupAt, getNotificationSettings, saveNotificationSettings } from './settings'

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
}

describe('Respaldo', () => {
  it('restaura exactamente el mismo progreso en otra instalación', async () => {
    await fillSource()
    const text = JSON.stringify(await createBackup(source, noon))

    await restoreBackup(target, parseBackup(text))

    expect(await getHud(target, today)).toEqual(await getHud(source, today))
    expect(await target.sideQuests.toArray()).toEqual(await source.sideQuests.toArray())
    expect((await getNotificationSettings(target)).night).toBe('23:15')
    expect(await getLastBackupAt(target)).toBe(noon.toISOString())
  })

  it('resume el contenido antes de importarlo', async () => {
    await fillSource()

    expect(summarizeBackup(await createBackup(source, noon))).toEqual({
      exportedAt: noon.toISOString(),
      bounties: 1,
      campaigns: 1,
      sideQuests: 1,
      totalXp: 140,
    })
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
