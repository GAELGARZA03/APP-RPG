// Videos del diario y de la bitácora: el archivo va en la tabla `media` y quien lo usa guarda solo su referencia.
import type { GameDatabase, VideoRef } from '../db'
import { MAX_VIDEO_BYTES } from './shared'

/** Video ya revisado por la interfaz (duración, peso y miniatura), listo para guardar. */
export interface NewVideo {
  blob: Blob
  duration: number
  poster?: string
}

/** Lo que se agrega al diario de una vez: fotos ya comprimidas y videos. */
export type NewMedia = { photo: string } | { video: NewVideo }

/** Guarda el archivo y devuelve su referencia. Se usa dentro de la transacción de quien lo agrega. */
export async function storeVideo(db: GameDatabase, video: NewVideo, now = new Date()): Promise<VideoRef> {
  if (video.blob.size > MAX_VIDEO_BYTES) throw new Error('Video demasiado pesado')
  const id = crypto.randomUUID()
  await db.media.add({ id, blob: video.blob, createdAt: now.getTime() })
  return {
    id,
    duration: Math.round(video.duration * 10) / 10,
    size: video.blob.size,
    ...(video.poster ? { poster: video.poster } : {}),
  }
}

/** El archivo de un video, o `null` si ya no está (por ejemplo, tras restaurar un respaldo). */
export async function getVideoBlob(db: GameDatabase, id: string): Promise<Blob | null> {
  return (await db.media.get(id))?.blob ?? null
}

/** Cuántos videos hay y cuánto pesan, para mostrarlo en Ajustes. */
export async function getMediaUsage(db: GameDatabase): Promise<{ count: number; bytes: number }> {
  let count = 0
  let bytes = 0
  await db.media.each((file) => {
    count += 1
    bytes += file.blob.size
  })
  return { count, bytes }
}
