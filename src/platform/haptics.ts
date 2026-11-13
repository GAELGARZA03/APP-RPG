import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export type HapticKind = 'tap' | 'complete' | 'unlock' | 'boss' | 'levelUp'

let enabled = true

/** Se apaga desde Ajustes. */
export function setHapticsEnabled(value: boolean) {
  enabled = value
}

const WEB_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  complete: 25,
  unlock: [20, 60, 30],
  boss: [40, 50, 40, 50, 90],
  levelUp: [30, 60, 30, 60, 60],
}

async function native(kind: HapticKind) {
  switch (kind) {
    case 'tap':
      return Haptics.impact({ style: ImpactStyle.Light })
    case 'complete':
      return Haptics.impact({ style: ImpactStyle.Medium })
    case 'unlock':
      return Haptics.notification({ type: NotificationType.Success })
    case 'boss':
      await Haptics.impact({ style: ImpactStyle.Heavy })
      return Haptics.vibrate({ duration: 220 })
    case 'levelUp':
      await Haptics.notification({ type: NotificationType.Success })
      return Haptics.impact({ style: ImpactStyle.Heavy })
  }
}

/** Vibración sutil en los momentos clave. Nunca lanza: si no hay motor háptico, no pasa nada. */
export function haptic(kind: HapticKind) {
  if (!enabled) return
  if (Capacitor.isNativePlatform()) void native(kind).catch(() => {})
  else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(WEB_PATTERNS[kind])
}
