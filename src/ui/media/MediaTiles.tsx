// Miniatura de video y visor a pantalla completa, compartidos por el diario y la bitácora de misiones.
import { Play, Trash2, VideoOff, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { db } from '../../data/appDb'
import type { VideoRef } from '../../data/db'
import { getVideoBlob } from '../../data/gameStore'
import { useBack } from '../backStack'
import { Button } from '../kit/Button'
import { cn } from '../kit/cn'
import { formatDuration } from './readMedia'

/** Miniatura de un video: su cuadro (o un fondo oscuro), el botón de reproducir y la duración. */
export function VideoThumb({ video, className }: { video: VideoRef; className?: string }) {
  return (
    <span className={cn('relative block size-full bg-void', className)}>
      {video.poster && <img src={video.poster} alt="" className="size-full object-cover" />}
      <span className="absolute inset-0 grid place-items-center bg-black/25">
        <span className="grid size-9 place-items-center rounded-full bg-black/60 text-white">
          <Play aria-hidden className="size-4 translate-x-px fill-current" />
        </span>
      </span>
      {video.duration > 0 && (
        <span className="absolute right-1 bottom-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white tabular-nums">
          {formatDuration(video.duration)}
        </span>
      )}
    </span>
  )
}

/** Video a pantalla completa. El archivo se lee de la base solo al abrirlo. */
export function VideoViewer({
  video,
  onClose,
  onDelete,
}: {
  video: VideoRef
  onClose: () => void
  onDelete?: () => void
}) {
  useBack(true, onClose)
  const close = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState<string | null | undefined>(undefined)

  useEffect(() => close.current?.focus(), [])
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    void getVideoBlob(db, video.id).then((blob) => {
      if (cancelled) return
      objectUrl = blob ? URL.createObjectURL(blob) : null
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [video.id])

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Video"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex justify-between p-2">
        {onDelete ? (
          <Button variant="ghost" size="icon" aria-label="Borrar video" onClick={onDelete}>
            <Trash2 aria-hidden />
          </Button>
        ) : (
          <span />
        )}
        <Button ref={close} variant="ghost" size="icon" aria-label="Cerrar video" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-2">
        {url ? (
          <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" />
        ) : url === null ? (
          <p className="flex max-w-xs flex-col items-center gap-2 text-center text-sm text-muted">
            <VideoOff aria-hidden className="size-8" />
            Este video no está en este teléfono. Los videos no viajan en el respaldo.
          </p>
        ) : null}
      </div>
    </motion.div>
  )
}
