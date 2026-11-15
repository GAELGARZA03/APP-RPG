// Pantallas pesadas que se cargan aparte del paquete inicial: el mapa, el árbol, la bitácora, el generador
// y la revisión semanal.
// Para que abrirlas siga siendo instantáneo, `preloadScreens` las descarga en segundo plano poco después de arrancar.
import { lazy } from 'react'

const loaders = {
  map: () => import('./CampaignMap'),
  tree: () => import('./SkillTree'),
  journal: () => import('./Journal'),
  notebook: () => import('./notebook/NotebookTab'),
  generator: () => import('./generator/GeneratorSheet'),
  review: () => import('./review/ReviewSheet'),
}

export const CampaignMap = lazy(() => loaders.map().then((module) => ({ default: module.CampaignMap })))
export const SkillTreeScreen = lazy(() => loaders.tree().then((module) => ({ default: module.SkillTreeScreen })))
export const SkillTreePreview = lazy(() => loaders.tree().then((module) => ({ default: module.SkillTreePreview })))
export const JournalTab = lazy(() => loaders.journal().then((module) => ({ default: module.JournalTab })))
export const NotebookTab = lazy(() => loaders.notebook().then((module) => ({ default: module.NotebookTab })))
export const GeneratorSheet = lazy(() => loaders.generator().then((module) => ({ default: module.GeneratorSheet })))
export const ReviewSheet = lazy(() => loaders.review().then((module) => ({ default: module.ReviewSheet })))

/** Descarga todas las pantallas diferidas cuando la app ya terminó de arrancar. */
export function preloadScreens() {
  const start = () => Object.values(loaders).forEach((load) => void load().catch(() => {}))
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1500)
}
