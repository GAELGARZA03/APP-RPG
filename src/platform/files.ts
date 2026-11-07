import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * En Android abre el menú de compartir para guardar el archivo donde elijas
 * (Mis archivos, Drive, correo...). En el navegador lo descarga.
 * Devuelve `false` si se canceló.
 */
export async function saveTextFile(fileName: string, contents: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({ title: fileName, url: uri, dialogTitle: 'Guardar respaldo' })
      return true
    } catch {
      return false
    }
  }

  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
  return true
}
