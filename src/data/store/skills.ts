// Árbol de habilidades: resolver sub-ramas, podar y leer el árbol.
import { skillKey } from '../../game/rules'
import type { GameDatabase, Skill } from '../db'
import { MAX_SKILL_NAME, allTables, byCreation, pathOf, skillMap } from './shared'

/**
 * Busca o crea habilidades comparando nombres sin acentos ni mayúsculas,
 * para que la IA no duplique una rama por escribirla distinto.
 */
export async function skillResolver(db: GameDatabase, origin: string, now: Date) {
  const all = await db.skills.toArray()
  let created = 0

  async function ensure(name: string, parentId: string | null): Promise<Skill> {
    const clean = name.trim().slice(0, MAX_SKILL_NAME)
    const existing = all.find((skill) => skill.parentId === parentId && skillKey(skill.name) === skillKey(clean))
    if (existing) return existing
    const skill: Skill = {
      id: crypto.randomUUID(),
      name: clean,
      parentId,
      createdAt: now.getTime() + created++,
      origin,
    }
    await db.skills.add(skill)
    all.push(skill)
    return skill
  }

  /** Sub-rama dentro de `branchId`; si el nombre está vacío o repite el de la rama, es la rama misma. */
  async function leaf(branchId: string | undefined, name: string | undefined): Promise<string | undefined> {
    if (!branchId) return undefined
    const branch = all.find((skill) => skill.id === branchId)
    if (!branch) return undefined
    // La IA a veces escribe la ruta completa ("Guitarra › Ritmo"): se usa el último tramo.
    const last = (name ?? '').split(/[›>/]/).pop()?.trim() ?? ''
    if (!skillKey(last) || skillKey(last) === skillKey(branch.name)) return branchId
    return (await ensure(last, branchId)).id
  }

  return { ensure, leaf }
}

/** Quita las habilidades que ya nadie usa y que nunca dieron XP. */
export async function pruneSkills(db: GameDatabase): Promise<void> {
  const skills = await db.skills.toArray()
  const used = new Set<string>()
  for (const event of await db.xpEvents.toArray()) if (event.skillId) used.add(event.skillId)
  for (const quest of await db.sideQuests.toArray()) if (quest.skillId) used.add(quest.skillId)
  for (const bounty of await db.bounties.toArray()) if (bounty.skillId) used.add(bounty.skillId)
  for (const daily of await db.dailies.toArray()) if (daily.skillId) used.add(daily.skillId)
  const branches = new Set<string>()
  for (const campaign of await db.campaigns.toArray()) {
    if (!campaign.skillId) continue
    used.add(campaign.skillId)
    branches.add(campaign.skillId)
  }
  // Las sub-ramas de una campaña que sigue viva se conservan aunque todavía no tengan XP ni misiones.
  for (const skill of skills) if (skill.parentId && branches.has(skill.parentId)) used.add(skill.id)

  // Un padre se conserva si algún descendiente se conserva.
  const byId = new Map(skills.map((skill) => [skill.id, skill]))
  const keep = new Set<string>()
  for (const id of used) {
    let current = byId.get(id)
    while (current && !keep.has(current.id)) {
      keep.add(current.id)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
  }
  await db.skills.bulkDelete(skills.filter((skill) => !keep.has(skill.id)).map((skill) => skill.id))
}

/** Árbol completo: el XP de cada rama es el suyo más el de sus sub-ramas. */
export async function getSkillTree(db: GameDatabase) {
  return db.transaction('r', db.skills, db.xpEvents, async () => {
    const skills = (await db.skills.toArray()).sort(byCreation)
    const own = new Map<string, number>()
    for (const event of await db.xpEvents.toArray()) {
      if (event.skillId) own.set(event.skillId, (own.get(event.skillId) ?? 0) + event.xp)
    }

    const children = new Map<string | null, Skill[]>()
    for (const skill of skills) {
      // Una habilidad cuyo padre ya no existe cuelga de la raíz.
      const parentId = skill.parentId && skills.some((other) => other.id === skill.parentId) ? skill.parentId : null
      children.set(parentId, [...(children.get(parentId) ?? []), skill])
    }

    const nodes: Array<{
      id: string
      name: string
      parentId: string | null
      origin?: string
      xp: number
      depth: number
    }> = []
    const visit = (skill: Skill, parentId: string | null, depth: number): number => {
      const node = { id: skill.id, name: skill.name, parentId, origin: skill.origin, xp: 0, depth }
      nodes.push(node)
      const below = (children.get(skill.id) ?? []).reduce((sum, child) => sum + visit(child, skill.id, depth + 1), 0)
      node.xp = (own.get(skill.id) ?? 0) + below
      return node.xp
    }
    const totalXp = (children.get(null) ?? []).reduce((sum, skill) => sum + visit(skill, null, 1), 0)

    return { nodes, totalXp }
  })
}

export type SkillTree = Awaited<ReturnType<typeof getSkillTree>>
export type SkillNode = SkillTree['nodes'][number]

/** Misiones que alimentaron una habilidad (incluidas sus sub-ramas). */
export async function getSkillDetail(db: GameDatabase, skillId: string) {
  return db.transaction('r', allTables(db), async () => {
    const skills = await skillMap(db)
    const skill = skills.get(skillId)
    if (!skill) return null

    const subtree = new Set<string>([skillId])
    let grew = true
    while (grew) {
      grew = false
      for (const other of skills.values()) {
        if (other.parentId && subtree.has(other.parentId) && !subtree.has(other.id)) {
          subtree.add(other.id)
          grew = true
        }
      }
    }

    const events = (await db.xpEvents.toArray()).filter((event) => event.skillId && subtree.has(event.skillId))
    const byTask = new Map<string, { title: string; kind: string; xp: number; times: number }>()
    for (const event of events) {
      let entry = byTask.get(event.taskId)
      if (!entry) {
        const task =
          event.kind === 'bounty'
            ? await db.bounties.get(event.taskId)
            : event.kind === 'daily'
              ? await db.dailies.get(event.taskId)
              : await db.sideQuests.get(event.taskId)
        const kind = event.kind === 'bounty' ? 'Contrato diario' : event.kind === 'daily' ? 'Misión del día' : 'Misión'
        entry = { title: task?.title ?? 'Misión borrada', kind, xp: 0, times: 0 }
        byTask.set(event.taskId, entry)
      }
      entry.xp += event.xp
      entry.times += 1
    }

    return {
      skill,
      path: pathOf(skills, skillId) ?? skill.name,
      xp: events.reduce((sum, event) => sum + event.xp, 0),
      missions: [...byTask.values()].sort((a, b) => b.xp - a.xp),
    }
  })
}

export type SkillDetail = NonNullable<Awaited<ReturnType<typeof getSkillDetail>>>
