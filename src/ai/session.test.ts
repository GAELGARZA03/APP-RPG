import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { GameDatabase } from '../data/db'
import { getAiSettings, saveAiModels, saveAiSaver } from '../data/settings'
import { saverMode } from './session'

describe('modo ahorro', () => {
  const db = new GameDatabase('modo-ahorro')
  afterEach(() => db.settings.clear())

  it('sin elegir, solo está activo en la app de pruebas (fuera de Android, nunca)', async () => {
    expect(await saverMode(await getAiSettings(db))).toBe(false)
  })

  it('respeta lo que elige el jugador', async () => {
    await saveAiSaver(db, true)
    expect(await saverMode(await getAiSettings(db))).toBe(true)
    await saveAiSaver(db, false)
    expect(await saverMode(await getAiSettings(db))).toBe(false)
  })

  it('cambiar un modelo no borra la elección', async () => {
    await saveAiSaver(db, true)
    await saveAiModels(db, { mainModel: 'otro-modelo' })
    expect(await getAiSettings(db)).toMatchObject({ mainModel: 'otro-modelo', saver: true })
  })
})
