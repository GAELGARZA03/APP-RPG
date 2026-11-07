import { describe, expect, it } from 'vitest'
import { DEFAULT_COSMETICS, effectiveCosmetics, nextUnlock, SOUNDS, THEMES, TITLES, unlocksBetween } from './cosmetics'

describe('Recompensas estéticas', () => {
  it('en el nivel 1 ya hay tema, título y sonido iniciales, y se puede silenciar', () => {
    expect(THEMES.filter((theme) => theme.level === 1).map((theme) => theme.id)).toEqual(['terminal'])
    expect(TITLES[0]).toMatchObject({ id: 'apprentice', level: 1 })
    expect(SOUNDS.filter((sound) => sound.level === 1).map((sound) => sound.id)).toEqual(['off', 'classic'])
  })

  it('anuncia lo que se desbloquea al subir varios niveles de golpe', () => {
    expect(unlocksBetween(1, 2)).toEqual(['Título «Explorador»'])
    expect(unlocksBetween(2, 4)).toEqual(['Tema Ámbar CRT', 'Título «Aventurero»', 'Sonidos Arcade'])
    expect(unlocksBetween(4, 4)).toEqual([])
  })

  it('muestra el siguiente desbloqueo', () => {
    expect(nextUnlock(1)).toEqual({ level: 2, labels: ['Título «Explorador»'] })
    expect(nextUnlock(5)).toEqual({ level: 6, labels: ['Título «Cazador de Contratos»', 'Efecto CRT'] })
    expect(nextUnlock(20)).toBeNull()
  })

  it('si una elección deja de estar desbloqueada, vuelve a la opción inicial', () => {
    const choice = { theme: 'neon', title: 'veteran', sound: 'crystal', crt: true } as const

    expect(effectiveCosmetics(choice, 12)).toEqual(choice)
    expect(effectiveCosmetics(choice, 5)).toEqual({ ...DEFAULT_COSMETICS, theme: 'neon' })
    expect(effectiveCosmetics({ ...DEFAULT_COSMETICS, sound: 'off' }, 1).sound).toBe('off')
  })
})
