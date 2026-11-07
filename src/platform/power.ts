import { Capacitor, registerPlugin } from '@capacitor/core'

/** Plugin propio (android/app/.../PowerSettingsPlugin.java). */
interface PowerSettingsPlugin {
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>
  requestIgnoreBatteryOptimizations(): Promise<void>
}

const PowerSettings = registerPlugin<PowerSettingsPlugin>('PowerSettings')

/** `null` fuera de Android. One UI puede dormir la app y retrasar los recordatorios. */
export async function isBatteryUnrestricted(): Promise<boolean | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  return (await PowerSettings.isIgnoringBatteryOptimizations()).value
}

export async function requestBatteryUnrestricted(): Promise<void> {
  await PowerSettings.requestIgnoreBatteryOptimizations()
}
