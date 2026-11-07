import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.gaelgarza.realliferpg',
  appName: 'Real Life RPG',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_rlrpg',
      iconColor: '#4ade80',
    },
  },
}

export default config
