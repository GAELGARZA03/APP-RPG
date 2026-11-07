import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { cn } from './cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums [&_svg]:size-3',
  {
    variants: {
      tone: {
        signal: 'bg-signal/15 text-signal',
        info: 'bg-info/15 text-info',
        ember: 'bg-ember/15 text-ember',
        muted: 'bg-white/[0.06] text-muted',
      },
    },
    defaultVariants: { tone: 'muted' },
  },
)

export function Badge({
  tone,
  className,
  children,
}: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
}
