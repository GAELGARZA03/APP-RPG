import { useLiveQuery } from 'dexie-react-hooks'
import { Flag, Maximize, Network, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { db } from '../data/appDb'
import { getSkillDetail, getSkillTree, type SkillNode, type SkillTree as SkillTreeData } from '../data/gameStore'
import { mastery, MASTERY_LEVELS } from '../game/rules'
import { layoutSkillTree, type SkillLayout } from '../game/skillLayout'
import { useBack } from './backStack'
import { Badge } from './kit/Badge'
import { Button } from './kit/Button'
import { cardSurface } from './kit/Card'
import { cn } from './kit/cn'
import { ProgressBar } from './kit/controls'
import { Screen } from './Screen'

const PADDING = 72
const MIN_SCALE = 0.3
/** Por debajo de esta escala los nombres ya no se leen: el árbol grande empieza acercado a la raíz. */
const READABLE_SCALE = 0.7
const MAX_SCALE = 3

function nodeRadius(depth: number, level: number) {
  return (depth === 1 ? 24 : depth === 2 ? 19 : 15) + level * 1.5
}

function splitLabel(name: string): string[] {
  if (name.length <= 14) return [name]
  const middle = name.length / 2
  const spaces = [...name.matchAll(/ /g)].map((match) => match.index)
  if (spaces.length === 0) return [name]
  const cut = spaces.reduce((best, index) => (Math.abs(index - middle) < Math.abs(best - middle) ? index : best))
  return [name.slice(0, cut), name.slice(cut + 1)]
}

/**
 * Dibujo del árbol en SVG. Las ramas con XP son más gruesas y brillantes cuanto más dominio;
 * las habilidades sin progreso se ven apagadas pero visibles.
 */
function TreeArt(props: {
  tree: SkillTreeData
  layout: SkillLayout
  selectedId?: string | null
  animate: boolean
  compact?: boolean
}) {
  const { tree, layout, selectedId, animate, compact } = props
  const { bounds } = layout
  const width = bounds.maxX - bounds.minX + PADDING * 2
  const height = bounds.maxY - bounds.minY + PADDING * 2
  const byId = new Map(tree.nodes.map((node) => [node.id, node]))
  const placed = new Map(layout.nodes.map((node) => [node.id, node]))
  const gradientId = compact ? 'skill-halo-mini' : 'skill-halo'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${bounds.minX - PADDING} ${bounds.minY - PADDING} ${width} ${height}`}
      className="block overflow-visible"
      aria-hidden={compact}
    >
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" style={{ stopColor: 'var(--color-signal)', stopOpacity: 0.55 }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-signal)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {layout.nodes.map((node) => {
        const data = byId.get(node.id)!
        const parent = node.parentId ? placed.get(node.parentId) : null
        const from = parent ?? { x: 0, y: 0, angle: -Math.PI / 2 }
        const reach = layout.ring * 0.45
        const level = mastery(data.xp).level
        const lit = data.xp > 0
        const d = `M ${from.x} ${from.y} C ${from.x + Math.cos(from.angle) * reach} ${from.y + Math.sin(from.angle) * reach}, ${
          node.x - Math.cos(node.angle) * reach
        } ${node.y - Math.sin(node.angle) * reach}, ${node.x} ${node.y}`
        return (
          <path
            key={`branch-${node.id}`}
            d={d}
            pathLength={1}
            fill="none"
            strokeLinecap="round"
            strokeWidth={lit ? 5 + level * 2.5 + (node.depth === 1 ? 2 : 0) : 3}
            className={cn(lit ? 'stroke-signal' : 'stroke-line', animate && 'tree-branch')}
            style={{ opacity: lit ? 0.5 + level * 0.12 : 1, animationDelay: `${(node.depth - 1) * 220}ms` }}
          />
        )
      })}

      {/* El jugador es la raíz. */}
      <circle r={64} fill={`url(#${gradientId})`} />
      <circle r={22} className="fill-signal" />
      <circle r={22} fill="none" strokeWidth={3} className="stroke-void/40" />
      <text
        y={5}
        textAnchor="middle"
        className="fill-on-signal font-display font-bold"
        style={{ fontSize: 14 }}
      >
        TÚ
      </text>

      {layout.nodes.map((node) => {
        const data = byId.get(node.id)!
        const level = mastery(data.xp)
        const lit = data.xp > 0
        const radius = nodeRadius(node.depth, level.level)
        const selected = node.id === selectedId
        const progress = level.xpToNext ? level.xpIntoLevel / level.xpToNext : 1
        const circumference = 2 * Math.PI * (radius + 4)
        const lines = splitLabel(data.name)
        return (
          <g
            key={node.id}
            data-skill={node.id}
            transform={`translate(${node.x} ${node.y})`}
            role={compact ? undefined : 'button'}
            aria-label={compact ? undefined : `${data.name}: ${level.name}, ${data.xp} XP`}
          >
            <g className={cn(animate && 'tree-node')} style={{ animationDelay: `${node.depth * 220 + 150}ms` }}>
              {lit && <circle r={radius * 2.7} fill={`url(#${gradientId})`} className={cn(selected && 'tree-halo')} />}
              {/* Área táctil amplia: un nodo pequeño sigue siendo fácil de tocar. */}
              <circle r={Math.max(radius + 10, 26)} fill="transparent" />
              <circle
                r={radius}
                strokeWidth={lit ? 3 : 2}
                className={cn(lit ? 'fill-panel stroke-signal' : 'fill-raised stroke-line')}
              />
              {lit && <circle r={radius - 5} className="fill-signal" style={{ opacity: 0.25 + level.level * 0.18 }} />}
              {lit && (
                <circle
                  r={radius + 4}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  className="stroke-signal"
                  strokeDasharray={`${circumference * progress} ${circumference}`}
                  transform="rotate(-90)"
                  opacity={0.9}
                />
              )}
              {selected && <circle r={radius + 9} fill="none" strokeWidth={2} className="stroke-ink" />}
              <text
                y={5}
                textAnchor="middle"
                className={cn('font-display font-bold', lit ? 'fill-ink' : 'fill-muted')}
                style={{ fontSize: node.depth === 1 ? 15 : 13 }}
              >
                {lit ? level.level + 1 : '·'}
              </text>
              {!compact &&
                lines.map((line, index) => (
                  <text
                    key={line}
                    y={radius + 20 + index * 14}
                    textAnchor="middle"
                    className={cn(lit ? 'fill-ink' : 'fill-muted', node.depth === 1 && 'font-display font-semibold')}
                    style={{ fontSize: node.depth === 1 ? 14 : 12, paintOrder: 'stroke', stroke: 'var(--color-void)', strokeWidth: 4 }}
                  >
                    {line}
                  </text>
                ))}
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/** Vista reducida y estática para la tarjeta del Perfil. */
export function SkillTreePreview({ tree }: { tree: SkillTreeData }) {
  const layout = useMemo(() => layoutSkillTree(tree.nodes), [tree])
  const width = layout.bounds.maxX - layout.bounds.minX + PADDING * 2
  const height = layout.bounds.maxY - layout.bounds.minY + PADDING * 2
  const box = { width: 320, height: 170 }
  const scale = Math.min(box.width / width, box.height / height, 1)

  return (
    <div className="relative mx-auto w-full overflow-hidden" style={{ height: box.height, maxWidth: box.width }}>
      <div
        className="absolute top-1/2 left-1/2"
        style={{ transform: `translate(-50%, -50%) scale(${scale})`, width, height }}
      >
        <TreeArt tree={tree} layout={layout} animate={false} compact />
      </div>
    </div>
  )
}

function SkillPanel({ node, onClose }: { node: SkillNode; onClose: () => void }) {
  const detail = useLiveQuery(() => getSkillDetail(db, node.id), [node.id])
  const level = mastery(node.xp)
  useBack(true, onClose)

  return (
    <motion.div
      role="region"
      aria-label={`Detalle de ${node.name}`}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className={cn(
        cardSurface,
        'absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] mx-auto flex max-h-[55%] max-w-md flex-col gap-3 overflow-y-auto p-4 shadow-2xl shadow-black/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{detail?.path ?? node.name}</p>
          <h2 className="font-display text-2xl leading-tight font-semibold">{node.name}</h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="Cerrar detalle" onClick={onClose} className="-mt-2 -mr-2">
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={node.xp > 0 ? 'signal' : 'muted'} className="px-2.5 py-1 text-xs">
          <Sparkles aria-hidden />
          {node.xp > 0 ? level.name : 'Sin despertar'}
        </Badge>
        <Badge className="px-2.5 py-1 text-xs">{node.xp} XP</Badge>
        {node.origin && (
          <Badge className="max-w-full px-2.5 py-1 text-xs">
            <Flag aria-hidden />
            <span className="truncate">{node.origin}</span>
          </Badge>
        )}
      </div>

      {level.xpToNext !== null ? (
        <ProgressBar
          size="lg"
          value={level.xpIntoLevel}
          max={level.xpToNext}
          text={`${level.xpIntoLevel} / ${level.xpToNext} XP para ${level.nextName}`}
          label={`Progreso hacia ${level.nextName}`}
        />
      ) : (
        <p className="text-sm font-medium text-signal">Dominio máximo alcanzado.</p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">Misiones que la hicieron crecer</p>
        {detail && detail.missions.length === 0 && (
          <p className="text-sm text-muted">Aún ninguna. Completa misiones de esta habilidad para encenderla.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {detail?.missions.slice(0, 12).map((mission) => (
            <li
              key={`${mission.kind}-${mission.title}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-void/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate">{mission.title}</span>
                <span className="block text-xs text-muted">
                  {mission.kind}
                  {mission.times > 1 ? ` · ${mission.times} veces` : ''}
                </span>
              </span>
              <Badge tone="signal">+{mission.xp}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

/** Árbol de habilidades a pantalla completa: se mueve con un dedo y se acerca con dos. */
export function SkillTreeScreen({ onClose }: { onClose: () => void }) {
  const tree = useLiveQuery(() => getSkillTree(db), [])
  const layout = useMemo(() => (tree ? layoutSkillTree(tree.nodes) : null), [tree])
  const viewport = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const view = useRef({ x: 0, y: 0, scale: 1 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, pinch: 0 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = tree?.nodes.find((node) => node.id === selectedId) ?? null

  // El gesto mueve el lienzo directamente, sin pasar por React: así se mantiene fluido.
  const apply = () => {
    const { x, y, scale } = view.current
    if (canvas.current) canvas.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
  }

  const fit = () => {
    const element = viewport.current
    if (!element || !layout) return
    const width = layout.bounds.maxX - layout.bounds.minX + PADDING * 2
    const height = layout.bounds.maxY - layout.bounds.minY + PADDING * 2
    const available = { width: element.clientWidth || 360, height: (element.clientHeight || 640) - 40 }
    const whole = Math.min(available.width / width, available.height / height)
    const scale = Math.min(1.5, Math.max(READABLE_SCALE, whole))
    // Si cabe entero se centra; si no, se muestra desde la raíz (abajo, al centro) y el resto se explora moviéndolo.
    const rootX = -(layout.bounds.minX - PADDING) * scale
    const rootY = -(layout.bounds.minY - PADDING) * scale
    view.current =
      whole >= READABLE_SCALE
        ? { scale, x: (available.width - width * scale) / 2, y: (available.height - height * scale) / 2 + 24 }
        : {
            scale,
            x: available.width / 2 - rootX,
            // Si a esta escala cabe de alto, se centra; si no, la raíz queda abajo.
            y: height * scale <= available.height ? (available.height - height * scale) / 2 + 24 : available.height - 70 - rootY,
          }
    apply()
  }

  const nodeCount = tree?.nodes.length ?? 0
  useLayoutEffect(fit, [nodeCount > 0, layout?.ring])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    // La rueda acerca y aleja en el navegador de escritorio.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = viewport.current!.getBoundingClientRect()
    const point = { x: clientX - rect.left, y: clientY - rect.top }
    const current = view.current
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor))
    const ratio = scale / current.scale
    view.current = { scale, x: point.x - (point.x - current.x) * ratio, y: point.y - (point.y - current.y) * ratio }
    apply()
  }

  function onPointerDown(event: React.PointerEvent) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: 0 }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y)
      gesture.current.moved = 99
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointers.current.size === 1) {
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      gesture.current.moved += Math.abs(dx) + Math.abs(dy)
      // Un toque con un pequeño temblor no debe mover el árbol.
      if (gesture.current.moved < 8) return
      viewport.current?.setPointerCapture?.(event.pointerId)
      view.current.x += dx
      view.current.y += dy
      apply()
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.current.pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / gesture.current.pinch)
      gesture.current.pinch = distance
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const wasTap = pointers.current.size === 1 && gesture.current.moved < 8
    pointers.current.delete(event.pointerId)
    gesture.current.pinch = 0
    if (!wasTap) return
    const id = (event.target as Element).closest?.('[data-skill]')?.getAttribute('data-skill') ?? null
    setSelectedId((current) => (id === current ? null : id))
  }

  const lit = tree?.nodes.filter((node) => node.xp > 0).length ?? 0

  return (
    <Screen
      title="Árbol de habilidades"
      eyebrow={tree ? `${lit} de ${tree.nodes.length} encendidas · ${tree.totalXp} XP` : undefined}
      onClose={onClose}
      fixed
      action={
        nodeCount > 0 ? (
          <Button variant="ghost" size="icon" aria-label="Centrar el árbol" onClick={fit}>
            <Maximize aria-hidden />
          </Button>
        ) : undefined
      }
    >
      {tree && nodeCount === 0 && (
        <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 px-8 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-signal/15 ring-2 ring-signal/40">
            <Network aria-hidden className="size-9 text-signal" />
          </span>
          <p className="font-display text-xl font-semibold">Tu árbol aún es una semilla</p>
          <p className="text-sm text-muted">
            Genera una campaña con IA: cada misión que completes hará crecer una rama con lo que vas aprendiendo.
          </p>
        </div>
      )}

      {tree && layout && nodeCount > 0 && (
        <>
          <div
            ref={viewport}
            data-testid="skill-tree"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="absolute inset-0 touch-none overflow-hidden select-none"
          >
            <div ref={canvas} className="absolute top-0 left-0 origin-top-left will-change-transform">
              <TreeArt tree={tree} layout={layout} selectedId={selectedId} animate />
            </div>
          </div>

          <ul
            aria-label="Niveles de dominio"
            className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-md flex-wrap justify-center gap-x-3 gap-y-1 px-4 text-[11px] text-muted"
          >
            {MASTERY_LEVELS.map((level, index) => (
              <li key={level.name} className="flex items-center gap-1">
                <span className="grid size-4 place-items-center rounded-full bg-signal/20 font-display text-[10px] font-bold text-signal">
                  {index + 1}
                </span>
                {level.name}
              </li>
            ))}
          </ul>

          <AnimatePresence>
            {selected && <SkillPanel key={selected.id} node={selected} onClose={() => setSelectedId(null)} />}
          </AnimatePresence>
        </>
      )}
    </Screen>
  )
}
