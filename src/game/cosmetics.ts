// Recompensas estéticas por nivel. Nunca bloquean funciones ni tareas: solo cambian cómo se ve y suena la app.

export type ThemeId = 'terminal' | 'amber' | 'neon' | 'grey' | 'gold'
export type SoundId = 'off' | 'classic' | 'arcade' | 'crystal' | 'bass'
export type TitleId = 'apprentice' | 'explorer' | 'adventurer' | 'hunter' | 'veteran' | 'insomniac' | 'legend'

interface Unlockable<Id extends string> {
  id: Id
  name: string
  level: number
}

export interface Theme extends Unlockable<ThemeId> {
  /** Colores de muestra para la vista previa: fondo y acento. */
  swatch: [string, string]
}

export const THEMES: Theme[] = [
  { id: 'terminal', name: 'Lima Nocturna', level: 1, swatch: ['#070908', '#8fe03a'] },
  { id: 'amber', name: 'Ámbar CRT', level: 3, swatch: ['#0f0a05', '#ffb000'] },
  { id: 'neon', name: 'Neón', level: 5, swatch: ['#0a0614', '#22d3ee'] },
  { id: 'grey', name: 'Consola Gris', level: 8, swatch: ['#16181c', '#a3e635'] },
  { id: 'gold', name: 'Oro Legendario', level: 12, swatch: ['#0d0a14', '#fbbf24'] },
]

export const TITLES: Array<Unlockable<TitleId>> = [
  { id: 'apprentice', name: 'Aprendiz', level: 1 },
  { id: 'explorer', name: 'Explorador', level: 2 },
  { id: 'adventurer', name: 'Aventurero', level: 4 },
  { id: 'hunter', name: 'Cazador de Contratos', level: 6 },
  { id: 'veteran', name: 'Veterano', level: 10 },
  { id: 'insomniac', name: 'Héroe Insomne', level: 15 },
  { id: 'legend', name: 'Leyenda Viviente', level: 20 },
]

export const SOUNDS: Array<Unlockable<SoundId>> = [
  { id: 'off', name: 'Sin sonido', level: 1 },
  { id: 'classic', name: 'Clásico', level: 1 },
  { id: 'arcade', name: 'Arcade', level: 4 },
  { id: 'crystal', name: 'Cristal', level: 7 },
  { id: 'bass', name: 'Bajo 8-bit', level: 11 },
]

export const CRT_EFFECT = { name: 'Efecto CRT', level: 6 }

export interface CosmeticChoice {
  theme: ThemeId
  title: TitleId
  sound: SoundId
  crt: boolean
}

export const DEFAULT_COSMETICS: CosmeticChoice = {
  theme: 'terminal',
  title: 'apprentice',
  sound: 'classic',
  crt: false,
}

const unlocked = <Id extends string>(items: Array<Unlockable<Id>>, id: Id, level: number) =>
  items.some((item) => item.id === id && item.level <= level)

/**
 * Lo que realmente se muestra. Si una elección ya no está desbloqueada
 * (por ejemplo, tras deshacer una tarea y bajar de nivel), se usa la opción inicial.
 */
export function effectiveCosmetics(choice: CosmeticChoice, level: number): CosmeticChoice {
  return {
    theme: unlocked(THEMES, choice.theme, level) ? choice.theme : DEFAULT_COSMETICS.theme,
    title: unlocked(TITLES, choice.title, level) ? choice.title : DEFAULT_COSMETICS.title,
    sound: unlocked(SOUNDS, choice.sound, level) ? choice.sound : DEFAULT_COSMETICS.sound,
    crt: choice.crt && level >= CRT_EFFECT.level,
  }
}

function allUnlockables(): Array<{ label: string; level: number }> {
  return [
    ...THEMES.map((theme) => ({ label: `Tema ${theme.name}`, level: theme.level })),
    ...TITLES.map((title) => ({ label: `Título «${title.name}»`, level: title.level })),
    ...SOUNDS.map((sound) => ({ label: `Sonidos ${sound.name}`, level: sound.level })),
    { label: CRT_EFFECT.name, level: CRT_EFFECT.level },
  ]
}

/** Recompensas ganadas al pasar de `fromLevel` a `toLevel` (sin incluir las de `fromLevel`). */
export function unlocksBetween(fromLevel: number, toLevel: number): string[] {
  return allUnlockables()
    .filter((item) => item.level > fromLevel && item.level <= toLevel)
    .sort((a, b) => a.level - b.level)
    .map((item) => item.label)
}

export function nextUnlock(level: number): { level: number; labels: string[] } | null {
  const upcoming = allUnlockables().filter((item) => item.level > level)
  if (upcoming.length === 0) return null
  const nextLevel = Math.min(...upcoming.map((item) => item.level))
  return { level: nextLevel, labels: upcoming.filter((item) => item.level === nextLevel).map((item) => item.label) }
}

export function titleName(id: TitleId): string {
  return TITLES.find((title) => title.id === id)?.name ?? TITLES[0].name
}
