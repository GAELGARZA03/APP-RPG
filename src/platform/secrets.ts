import { Capacitor, registerPlugin } from '@capacitor/core'

/** Plugin propio (android/app/.../SecretStorePlugin.java): cifra con el Android Keystore. */
interface SecretStorePlugin {
  get(options: { name: string }): Promise<{ value: string | null }>
  set(options: { name: string; value: string }): Promise<void>
  remove(options: { name: string }): Promise<void>
}

const SecretStore = registerPlugin<SecretStorePlugin>('SecretStore')
const native = Capacitor.getPlatform() === 'android'

/** En el navegador (solo desarrollo) la llave dura lo que dure la pestaña. */
export const secretsPersist = native

export async function getSecret(name: string): Promise<string | null> {
  if (native) return (await SecretStore.get({ name })).value
  return sessionStorage.getItem(`secret:${name}`)
}

export async function setSecret(name: string, value: string): Promise<void> {
  if (native) await SecretStore.set({ name, value })
  else sessionStorage.setItem(`secret:${name}`, value)
}

export async function removeSecret(name: string): Promise<void> {
  if (native) await SecretStore.remove({ name })
  else sessionStorage.removeItem(`secret:${name}`)
}
