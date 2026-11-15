(async () => {
  const open = () => new Promise((resolve, reject) => { const r = indexedDB.open('real-life-rpg'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
  const idb = await open()
  const all = (name) => new Promise((resolve) => { if (!idb.objectStoreNames.contains(name)) return resolve(null); const r = idb.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result) })
  const [bounties, campaigns, quests, events, player, skills, evidence, dailies, settings] = await Promise.all(['bounties', 'campaigns', 'sideQuests', 'xpEvents', 'player', 'skills', 'evidence', 'dailies', 'settings'].map(all))
  const out = {
    version: idb.version / 10,
    bounties: bounties.map((b) => `${b.title.slice(0, 40)} | d${b.difficulty} | arch:${b.archivedDay} | skill:${b.skillId ? 'si' : 'no'}`),
    campaigns: campaigns.map((c) => ({ title: c.title, acts: (c.acts ?? []).map((a) => `${a.title} [${a.status}]`), analysis: !!c.analysis })),
    quests: quests.map((q) => `${(campaigns.find((c) => c.id === q.campaignId)?.title ?? 'suelta').slice(0, 14)} | ${q.title.slice(0, 44)} | d${q.difficulty}${q.boss ? ' JEFE' : ''} | done:${q.completedDay ?? '-'} skip:${q.skippedDay ?? '-'} steps:${(q.stepsDone ?? []).length}/${(q.steps ?? []).length}`),
    xpTotal: events.reduce((s, e) => s + e.xp, 0),
    events: events.length,
    eventKinds: [...new Set(events.map((e) => e.kind))],
    player,
    skills: skills?.map((s) => s.name),
    evidence: evidence?.map((e) => `${e.taskTitle.slice(0, 30)} | ${e.photo ? 'foto ' + Math.round(e.photo.length / 1024) + ' KB' : 'nota: ' + e.note.slice(0, 40)}`),
    dailies: dailies?.map((d) => `${d.id} | ${d.title} | d${d.difficulty} | done:${d.completedDay}`),
    settings: settings.map((s) => (s.id === 'profile' ? { id: 'profile', name: s.name, photo: !!s.photo } : s)),
  }
  idb.close()
  return JSON.stringify(out, null, 1)
})()
