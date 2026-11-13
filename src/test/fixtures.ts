import type { CampaignDesign, MissionPlan } from '../ai/gemini'

const mission = (title: string, difficulty: MissionPlan['difficulty'], skill: string, steps: string[]): MissionPlan => ({
  title,
  difficulty,
  description: `${title}: descripción de prueba.`,
  steps,
  estimate: '30 min',
  why: 'Porque acerca a la meta.',
  tip: 'Ve despacio.',
  skill,
})

/** La campaña del Anexo A de la especificación, como la devolvería la IA ya validada. */
export const guitarDesign: CampaignDesign = {
  campaign: 'Del silencio al escenario',
  analysis: {
    diagnosis: 'Sin bases musicales. Con 48 horas es realista dominar acordes abiertos.',
    successCriteria: 'Tocas 3 canciones completas sin detenerte y lo grabas.',
    obstacles: [
      { obstacle: 'Dolor en las yemas', solution: 'Sesiones cortas y diarias.' },
      { obstacle: 'Cambios lentos', solution: 'Metrónomo a velocidad baja.' },
    ],
    duration: '12 semanas',
  },
  skills: { area: 'Música', branch: 'Guitarra', leaves: ['Fundamentos', 'Acordes abiertos', 'Ritmo', 'Repertorio'] },
  acts: [
    { title: 'Primeros acordes', goal: 'Semanas 1 a 3: sonar limpio con 4 acordes.', difficulty: 2 },
    { title: 'Ritmo y cambios', goal: 'Semanas 4 a 7: cambiar a tiempo.', difficulty: 3 },
    { title: 'El concierto', goal: 'Semana 12: la prueba final.', difficulty: 5 },
  ],
  missions: [
    mission('Afina tu guitarra y conoce sus cuerdas', 1, 'Fundamentos', ['Afina las 6 cuerdas', 'Nombra las cuerdas 3 veces']),
    mission('Domina Mi menor y La menor', 2, 'Acordes abiertos', ['Forma cada acorde 10 veces', 'Cambia 20 veces a 60 bpm']),
    mission('Tu primera progresión', 3, 'Ritmo', ['Toca Sol–Re–Em–Do 2 minutos', 'Grábate y escucha']),
  ],
  boss: mission('El concierto', 5, 'Repertorio', ['Toca 3 canciones para una persona', 'Sube la evidencia a tu bitácora']),
  bounties: [mission('Practica cambios de acordes 10 minutos', 1, 'Acordes abiertos', ['Practica 10 minutos'])],
}

export const actTwoMissions: MissionPlan[] = [
  mission('Rasguea abajo-arriba a 80 bpm', 3, 'Ritmo', ['Rasguea 3 minutos seguidos', 'Sube a 90 bpm']),
  mission('Cambia de acorde sin mirar', 3, 'Acordes abiertos', ['Haz 30 cambios con los ojos cerrados', 'Cuenta los fallos']),
]

/** Respuesta de `generateContent` con el JSON como texto. */
export const generateReply = (payload: unknown, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(payload) }] } }],
})

/** Respuesta de la API Interactions: un paso de razonamiento y la salida del modelo. */
export const interactionReply = (payload: unknown, status = 'completed') => ({
  status,
  steps: [
    { type: 'thought', signature: 'abc' },
    { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(payload) }] },
  ],
})
