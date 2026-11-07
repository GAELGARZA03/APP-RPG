import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from './cn'

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color,border-color,color,filter] duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-signal text-on-signal shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_28px_-12px_var(--color-signal)] active:brightness-90',
        secondary:
          'border border-white/[0.07] bg-raised text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] active:border-signal/60',
        outline: 'border border-signal/50 bg-signal/10 text-signal active:bg-signal/20',
        ghost: 'text-muted active:bg-raised active:text-ink',
        danger: 'border border-ember/50 bg-ember/10 text-ember active:bg-ember/20',
        dashed: 'border border-dashed border-white/15 text-muted active:border-signal active:text-signal',
      },
      size: {
        sm: 'min-h-9 px-3.5 text-sm',
        md: 'min-h-11 px-5 text-sm',
        lg: 'min-h-14 px-6 font-display text-base tracking-wide uppercase',
        icon: 'size-11 [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
