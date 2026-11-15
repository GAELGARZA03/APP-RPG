import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

let testBuild: Promise<boolean> | null = null

/**
 * `true` en la app de pruebas (variante `pruebas` de Gradle, id terminado en `.pruebas`).
 * Ahí la IA usa el modelo rápido por defecto, para no gastar llamadas del principal en pruebas.
 */
export function isTestBuild(): Promise<boolean> {
  testBuild ??=
    Capacitor.getPlatform() === 'android'
      ? App.getInfo()
          .then((info) => info.id.endsWith('.pruebas'))
          .catch(() => false)
      : Promise.resolve(false)
  return testBuild
}
