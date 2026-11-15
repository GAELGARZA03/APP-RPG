// Compila la app y la instala en el teléfono por USB, en un solo paso.
//
//   npm run phone:pruebas    "RPG Pruebas" (icono naranja), para probar con escenarios
//   npm run phone:instalar   tu app personal, "Real Life RPG"
//
// Instalar encima conserva los datos de cada app.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { adb } from './app.mjs'

const variant = process.argv[2] === 'personal' ? 'personal' : 'pruebas'
const { task, apk, label } =
  variant === 'personal'
    ? {
        task: 'assembleDebug',
        apk: 'android/app/build/outputs/apk/debug/app-debug.apk',
        label: 'Real Life RPG (personal)',
      }
    : { task: 'assemblePruebas', apk: 'android/app/build/outputs/apk/pruebas/app-pruebas.apk', label: 'RPG Pruebas' }

const env = { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME ?? `${process.env.LOCALAPPDATA}\\Android\\Sdk` }
const step = (title, command, cwd = '.') => {
  console.log(`\n▶ ${title}`)
  execSync(command, { cwd, env, stdio: 'inherit' })
}

step('Compilando la app web y copiándola a Android', 'npm run android:sync')
step(
  `Compilando el APK de ${label}`,
  // Ruta completa: cmd.exe no siempre busca ejecutables en la carpeta actual.
  `"${resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}" ${task} --quiet`,
  'android',
)
if (!existsSync(apk)) throw new Error(`No se encontró ${apk}`)
step(`Instalando ${label} en el teléfono`, `"${adb}" install -r ${apk}`)
console.log(`\n✔ ${label} instalada.`)
