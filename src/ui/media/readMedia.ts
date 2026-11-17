// Convierte lo que elige el jugador en algo listo para guardar: fotos comprimidas y videos revisados.
// Los videos no se comprimen (haría falta un complemento nativo), así que se limita su duración y su peso.
import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, type NewMedia } from '../../data/gameStore'
import { imageFileToEvidence } from '../images'

/** Error con un mensaje para mostrarle al jugador. */
export class MediaError extends Error {}

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024))

export function isVideoFile(file: File) {
  return file.type.startsWith('video/')
}

export async function readMediaFile(file: File): Promise<NewMedia> {
  if (isVideoFile(file)) return { video: await readVideo(file) }
  try {
    return { photo: await imageFileToEvidence(file) }
  } catch {
    throw new MediaError('No se pudo usar una de las imágenes.')
  }
}

function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    video.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
    video.addEventListener('error', () => (clearTimeout(timer), reject(new Error('error'))), { once: true })
  })
}

/** Un cuadro del video en JPEG pequeño, para el calendario y las miniaturas. */
function posterOf(video: HTMLVideoElement): string | undefined {
  const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight))
  if (!video.videoWidth) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.6)
}

async function readVideo(file: File) {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new MediaError(`Ese video pesa ${megabytes(file.size)} MB y el máximo es ${megabytes(MAX_VIDEO_BYTES)} MB.`)
  }
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    video.src = url
    await waitFor(video, 'loadeddata', 15000).catch(() => {
      throw new MediaError('No se pudo leer ese video. Prueba con otro.')
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration > MAX_VIDEO_SECONDS + 0.5) {
      throw new MediaError(`Ese video dura ${Math.round(duration)} s y el máximo es ${MAX_VIDEO_SECONDS} s.`)
    }
    let poster: string | undefined
    try {
      video.currentTime = Math.min(0.5, duration / 2)
      await waitFor(video, 'seeked', 4000)
      poster = posterOf(video)
    } catch {
      // Sin miniatura se muestra un cuadro oscuro con el botón de reproducir.
    }
    return { blob: file, duration, ...(poster ? { poster } : {}) }
  } finally {
    video.removeAttribute('src')
    URL.revokeObjectURL(url)
  }
}

/** Lee varios archivos uno por uno (para no llenar la memoria) y junta los mensajes de error. */
export async function readMediaFiles(files: File[]): Promise<{ items: NewMedia[]; errors: string[] }> {
  const items: NewMedia[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      items.push(await readMediaFile(file))
    } catch (error) {
      errors.push(error instanceof MediaError ? error.message : 'No se pudo usar uno de los archivos.')
    }
  }
  return { items, errors: [...new Set(errors)] }
}

export function formatDuration(seconds: number) {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
