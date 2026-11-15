// Pantallas pesadas que se cargan aparte del paquete inicial: el mapa, el árbol, la bitácora y el generador.
// Para que abrirlas siga siendo instantáneo, `preloadScreens` las descarga en segundo plano poco después de arrancar.
import { lazy } from 'react'

const loaders = {
  map: () => import('./CampaignMap'),
  tree: () => import('./SkillTree'),
  journal: () => import('./Journal'),
  generator: () => import('./generator/GeneratorSheet'),
}

export const CampaignMap = lazy(() => loaders.map().then((module) => ({ default: module.CampaignMap })))
export const SkillTreeScreen = lazy(() => loaders.tree().then((module) => ({ default: module.SkillTreeScreen })))
export const SkillTreePreview = lazy(() => loaders.tree().then((module) => ({ default: module.SkillTreePreview })))
export const JournalScreen = lazy(() => loaders.journal().then((module) => ({ default: module.JournalScreen })))
export const GeneratorSheet = lazy(() => loaders.generator().then((module) => ({ default: module.GeneratorSheet })))

/** Descarga todas las pantallas diferidas cuando la app ya terminó de arrancar. */
export function preloadScreens() {
  const start = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1500)
}
