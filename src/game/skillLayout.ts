/** Posición de cada habilidad en el árbol: un abanico que crece hacia arriba desde el jugador. */

export interface LayoutInput {
  id: string
  parentId: string | null
}

export interface LayoutNode {
  id: string
  parentId: string | null
  depth: number
  x: number
  y: number
  /** Dirección en la que crece la rama, en radianes (−π/2 = hacia arriba). */
  angle: number
}

const MIN_RING = 104
/** Separación mínima entre hojas vecinas en el anillo más externo, para que sus nombres no se encimen. */
const LEAF_SPACING = 84
const UP = -Math.PI / 2

export function layoutSkillTree(input: ReadonlyArray<LayoutInput>) {
  const children = new Map<string | null, LayoutInput[]>()
  for (const node of input) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])

  const leafCount = new Map<string, number>()
  let maxDepth = 0
  const countLeaves = (node: LayoutInput, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth)
    const below = children.get(node.id) ?? []
    const count = below.length === 0 ? 1 : below.reduce((sum, child) => sum + countLeaves(child, depth + 1), 0)
    leafCount.set(node.id, count)
    return count
  }
  const roots = children.get(null) ?? []
  const totalLeaves = roots.reduce((sum, root) => sum + countLeaves(root, 1), 0)

  // El abanico se abre más cuantas más hojas haya, y los anillos se separan lo necesario.
  const span = Math.min((230 * Math.PI) / 180, Math.max((50 * Math.PI) / 180, totalLeaves * 0.4))
  const ring = Math.max(MIN_RING, maxDepth === 0 ? 0 : (LEAF_SPACING * totalLeaves) / span / maxDepth)

  const nodes: LayoutNode[] = []
  const place = (node: LayoutInput, depth: number, from: number, to: number) => {
    const angle = (from + to) / 2
    nodes.push({
      id: node.id,
      parentId: node.parentId,
      depth,
      x: Math.cos(angle) * ring * depth,
      y: Math.sin(angle) * ring * depth,
      angle,
    })
    let cursor = from
    for (const child of children.get(node.id) ?? []) {
      const width = ((to - from) * leafCount.get(child.id)!) / leafCount.get(node.id)!
      place(child, depth + 1, cursor, cursor + width)
      cursor += width
    }
  }
  let cursor = UP - span / 2
  for (const root of roots) {
    const width = totalLeaves === 0 ? span : (span * leafCount.get(root.id)!) / totalLeaves
    place(root, 1, cursor, cursor + width)
    cursor += width
  }

  const xs = [0, ...nodes.map((node) => node.x)]
  const ys = [0, ...nodes.map((node) => node.y)]
  return {
    nodes,
    ring,
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
  }
}

export type SkillLayout = ReturnType<typeof layoutSkillTree>
