import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.gaelgarza.realliferpg',
  appName: 'Real Life RPG',
  webDir: 'dist',
  plugins: {
    // La app siempre es oscura: iconos claros en las barras del sistema, aunque el teléfono esté en modo claro.
    SystemBars: {
      style: 'DARK',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_rlrpg',
      iconColor: '#4ade80',
    },
  },
}

export default config
