import { UserRound } from 'lucide-react'
import { cn } from './cn'

/** Foto de perfil redonda con anillo del color principal. Sin foto, muestra la inicial o un icono. */
export function Avatar({ photo, name, size = 'md' }: { photo: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-10 text-base', md: 'size-14 text-xl', lg: 'size-24 text-4xl' }
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-signal/15 font-display font-bold text-signal ring-2 ring-signal/60 shadow-[0_0_24px_-6px_var(--color-signal)]',
        sizes[size],
      )}
    >
      {photo ? (
        <img src={photo} alt="" className="size-full object-cover" />
      ) : initial ? (
        initial
      ) : (
        <UserRound aria-hidden className="size-1/2" />
      )}
    </span>
  )
}

/** Recorta la imagen al centro en un cuadrado de 256 px y la comprime como JPEG. */
export async function imageFileToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Sin canvas')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
