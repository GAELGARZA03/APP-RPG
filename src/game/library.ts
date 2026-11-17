// Biblioteca de principios: la base de conocimiento en la que se apoya la IA. Resúmenes propios (sin copiar
// texto de los libros) de docs/biblioteca/principios.md, con sus fuentes en docs/biblioteca/fuentes.md.

/** Dónde se usa cada principio al generar con IA. */
export type PrincipleUse = 'campaign' | 'act' | 'route' | 'daily' | 'review'

export type Evidence = 'alta' | 'media' | 'práctica'

export interface Principle {
  id: string
  group: 'habits' | 'learning' | 'goals'
  name: string
  idea: string
  apply: string
  evidence: Evidence
  uses: PrincipleUse[]
  sources: string[]
}

export const PRINCIPLE_GROUPS = [
  { id: 'habits', name: 'Formar hábitos' },
  { id: 'learning', name: 'Aprender habilidades' },
  { id: 'goals', name: 'Metas y motivación' },
] as const

export const PRINCIPLES: Principle[] = [
  {
    id: 'H1',
    group: 'habits',
    name: 'Atar el hábito a una señal',
    idea: 'Un hábito se dispara solo cuando se repite en el mismo contexto (un momento, un lugar o una acción previa); con la repetición, el contexto activa la conducta sin decidirla.',
    apply: 'Cada hábito tiene un momento claro («al despertar»), no «cuando pueda».',
    evidence: 'alta',
    uses: ['route', 'review'],
    sources: ['F3', 'F4', 'F8'],
  },
  {
    id: 'H2',
    group: 'habits',
    name: 'Plan «si pasa X, haré Y»',
    idea: 'Decidir de antemano cuándo y dónde se hará algo aumenta mucho la probabilidad de hacerlo, sobre todo lo que cuesta empezar.',
    apply:
      'Escribir hábitos y misiones con su situación disparadora; ante un obstáculo previsible, preparar la respuesta («si llueve, la rutina en casa»).',
    evidence: 'alta',
    uses: ['campaign', 'route', 'daily', 'review'],
    sources: ['F1', 'F2'],
  },
  {
    id: 'H3',
    group: 'habits',
    name: 'Apilar hábitos',
    idea: 'Enganchar el hábito nuevo a uno que ya haces todos los días («después de servirme el café, leeré 2 páginas»); el viejo funciona como señal.',
    apply: 'Sugerir un ancla concreta para cada hábito nuevo.',
    evidence: 'práctica',
    uses: ['route'],
    sources: ['F5', 'F7'],
  },
  {
    id: 'H4',
    group: 'habits',
    name: 'Empezar diminuto (regla de los 2 minutos)',
    idea: 'Un hábito nuevo empieza tan pequeño que sea casi imposible fallarlo; primero se construye la costumbre de presentarse y después crece.',
    apply: 'El primer nivel de cada hábito es su versión mínima; las primeras misiones se pueden hacer hoy mismo.',
    evidence: 'práctica',
    uses: ['route', 'campaign', 'act'],
    sources: ['F5', 'F7'],
  },
  {
    id: 'H5',
    group: 'habits',
    name: 'Si no ocurre, hazlo más fácil (B = MAP)',
    idea: 'Una conducta ocurre cuando coinciden motivación, capacidad y un detonante; si no sale, casi siempre funciona más hacerla fácil o mejorar el detonante que «echarle ganas».',
    apply: 'Si algo se atora, primero bajar su tamaño o cambiar su momento, no subir la exigencia.',
    evidence: 'práctica',
    uses: ['review', 'route', 'act'],
    sources: ['F6', 'F7'],
  },
  {
    id: 'H6',
    group: 'habits',
    name: 'Diseñar el entorno',
    idea: 'Es más fácil hacer lo que está a la vista y a la mano, y evitar lo que no: señal obvia y poca fricción para lo bueno; al revés para lo malo.',
    apply:
      'Misiones de preparación («deja la guitarra fuera del estuche») o de quitar fricciones («el celular fuera del cuarto»).',
    evidence: 'media',
    uses: ['campaign', 'daily', 'review'],
    sources: ['F3', 'F5'],
  },
  {
    id: 'H7',
    group: 'habits',
    name: 'Agrupar tentaciones',
    idea: 'Juntar algo que cuesta con algo que disfrutas, y permitirte lo segundo solo mientras haces lo primero. Es un empujón, no una solución permanente.',
    apply: 'Sugerirlo para hábitos poco atractivos («tu podcast favorito solo mientras caminas»).',
    evidence: 'media',
    uses: ['route', 'daily'],
    sources: ['F9', 'F5'],
  },
  {
    id: 'H8',
    group: 'habits',
    name: 'Hacerlo satisfactorio y visible',
    idea: 'Lo que trae una recompensa inmediata se repite; ver el progreso (marcar el día, la racha) es en sí una recompensa.',
    apply: 'Proponer metas cuyo avance se pueda marcar.',
    evidence: 'práctica',
    uses: ['campaign', 'route'],
    sources: ['F5', 'F21'],
  },
  {
    id: 'H9',
    group: 'habits',
    name: 'Celebrar justo después',
    idea: 'Una pequeña emoción positiva justo después de hacer el hábito ayuda a que se fije.',
    apply: 'Sugerir una celebración breve en los hábitos nuevos.',
    evidence: 'práctica',
    uses: ['route'],
    sources: ['F7'],
  },
  {
    id: 'H10',
    group: 'habits',
    name: 'Hábitos que construyen identidad',
    idea: 'Dura más enfocarse en quién quieres ser que solo en el resultado; cada vez que haces el hábito es un «voto» por esa identidad.',
    apply: 'Al explicar el porqué, conectarlo con la identidad que el jugador busca.',
    evidence: 'práctica',
    uses: ['campaign', 'route'],
    sources: ['F5'],
  },
  {
    id: 'H11',
    group: 'habits',
    name: 'Fallar una vez no arruina el hábito',
    idea: 'Saltarse un día no frena de forma importante el hábito; fallar seguido sí. Regla práctica: nunca fallar dos veces seguidas.',
    apply: 'Tras un fallo, el mensaje es retomar mañana, sin culpa.',
    evidence: 'media',
    uses: ['review', 'daily'],
    sources: ['F4', 'F5'],
  },
  {
    id: 'H12',
    group: 'habits',
    name: 'No hay número mágico de días',
    idea: 'El tiempo para que un hábito sea automático varía mucho (en un estudio, de 18 a 254 días, con mediana de 66); los «21 días» son un mito.',
    apply: 'Nunca prometer plazos; avanzar según la constancia real.',
    evidence: 'media',
    uses: ['route', 'review'],
    sources: ['F4'],
  },
  {
    id: 'H13',
    group: 'habits',
    name: 'Para cambiar un hábito, cambia la rutina',
    idea: 'Un hábito tiene señal, rutina y recompensa; para cambiarlo, conserva la señal y la recompensa y pon una rutina nueva en medio.',
    apply: 'Para dejar algo, proponer un reemplazo con la misma señal y recompensa, no solo «dejar de».',
    evidence: 'práctica',
    uses: ['campaign', 'route'],
    sources: ['F8'],
  },
  {
    id: 'H14',
    group: 'habits',
    name: 'Hábitos clave',
    idea: 'Algunos hábitos arrastran a otros (por ejemplo, el ejercicio suele llevar a comer y dormir mejor).',
    apply: 'Poner primero los hábitos con más efecto en cadena.',
    evidence: 'práctica',
    uses: ['route'],
    sources: ['F8'],
  },
  {
    id: 'A1',
    group: 'learning',
    name: 'Práctica deliberada',
    idea: 'Se mejora practicando una parte concreta, con meta específica, un poco más allá de lo que ya sale y con retroalimentación; no basta con repetir.',
    apply: 'Cada misión trabaja una parte medible («cambia entre Em y Am 20 veces a 60 bpm»), no «practicar guitarra».',
    evidence: 'media',
    uses: ['campaign', 'act', 'daily'],
    sources: ['F10', 'F11', 'F12'],
  },
  {
    id: 'A2',
    group: 'learning',
    name: 'Retroalimentación rápida',
    idea: 'Saber pronto si lo hiciste bien acelera el aprendizaje: grabarte, compararte con un modelo o pedir opinión.',
    apply: 'Incluir en los objetivos una forma de comprobar el resultado.',
    evidence: 'media',
    uses: ['campaign', 'act'],
    sources: ['F12', 'F18'],
  },
  {
    id: 'A3',
    group: 'learning',
    name: 'Practicar recordando',
    idea: 'Intentar recordar o hacer algo sin mirar fija mucho mejor lo aprendido que volver a leerlo.',
    apply: 'Misiones de «hazlo de memoria» o «explícalo sin notas», en vez de «repasa».',
    evidence: 'alta',
    uses: ['act', 'daily'],
    sources: ['F13', 'F17'],
  },
  {
    id: 'A4',
    group: 'learning',
    name: 'Espaciar la práctica',
    idea: 'Repartir la práctica en varios días funciona mejor que una sola sesión larga.',
    apply: 'Volver a temas anteriores en actos siguientes; sesiones cortas y frecuentes.',
    evidence: 'alta',
    uses: ['campaign', 'act'],
    sources: ['F14', 'F17'],
  },
  {
    id: 'A5',
    group: 'learning',
    name: 'Mezclar tipos de práctica',
    idea: 'Alternar varios tipos de ejercicio en una sesión enseña a elegir la técnica correcta, aunque al principio cueste más.',
    apply: 'En actos avanzados, misiones que combinen lo aprendido.',
    evidence: 'media',
    uses: ['act'],
    sources: ['F15', 'F17'],
  },
  {
    id: 'A6',
    group: 'learning',
    name: 'Dificultades que ayudan',
    idea: 'Lo que hace la práctica un poco más difícil (espaciar, mezclar, recordar sin ver) se siente lento pero deja un aprendizaje más duradero.',
    apply: 'Explicar que si una misión cuesta, no es mala señal.',
    evidence: 'alta',
    uses: ['campaign', 'review'],
    sources: ['F16', 'F17'],
  },
  {
    id: 'A7',
    group: 'learning',
    name: 'Mapear antes de empezar',
    idea: 'Entender al inicio qué hay que aprender, sus partes y cómo aprenden otros acelera todo lo demás.',
    apply: 'El primer acto puede incluir una misión corta de exploración.',
    evidence: 'práctica',
    uses: ['campaign'],
    sources: ['F18'],
  },
  {
    id: 'A8',
    group: 'learning',
    name: 'Practicar la habilidad real',
    idea: 'Se aprende mejor haciendo la cosa real que solo ejercicios sueltos; para lo muy complejo, primero una base.',
    apply: 'Cada acto se acerca a la prueba final real; el jefe es la habilidad completa en un contexto real.',
    evidence: 'práctica',
    uses: ['campaign', 'act'],
    sources: ['F18'],
  },
  {
    id: 'A9',
    group: 'learning',
    name: 'Atacar el punto débil',
    idea: 'Identificar la parte que más frena y practicarla aparte, para luego integrarla en la habilidad completa.',
    apply: 'Al generar el siguiente acto, enfocarse en lo que el jugador saltó, deshizo o tardó más.',
    evidence: 'práctica',
    uses: ['act', 'review'],
    sources: ['F18', 'F12'],
  },
  {
    id: 'M1',
    group: 'goals',
    name: 'Metas específicas y desafiantes',
    idea: 'Las metas concretas y retadoras producen mejor desempeño que «hacer lo mejor posible», sobre todo con retroalimentación del avance.',
    apply: 'Criterio de éxito concreto y medible; dificultad que sube acto por acto.',
    evidence: 'alta',
    uses: ['campaign', 'act'],
    sources: ['F19'],
  },
  {
    id: 'M2',
    group: 'goals',
    name: 'Desear, imaginar el obstáculo y planear (WOOP)',
    idea: 'Imaginar solo el éxito puede quitar energía; funciona mejor imaginar el resultado, luego el obstáculo real y un plan «si pasa X, haré Y».',
    apply: 'Identificar los obstáculos probables del jugador y darles un plan concreto.',
    evidence: 'media',
    uses: ['campaign', 'review'],
    sources: ['F20', 'F1'],
  },
  {
    id: 'M3',
    group: 'goals',
    name: 'Las pequeñas victorias motivan',
    idea: 'Avanzar en algo que importa, aunque sea poco, es de lo que más mejora el ánimo; los retrocesos pesan mucho.',
    apply: 'Siempre una misión pequeña disponible; reconocer los avances concretos.',
    evidence: 'media',
    uses: ['campaign', 'daily', 'review'],
    sources: ['F21'],
  },
]

export interface Source {
  id: string
  citation: string
  url?: string
}

export const SOURCES: Source[] = [
  {
    id: 'F1',
    citation:
      'Gollwitzer (1999). Implementation intentions: Strong effects of simple plans. American Psychologist, 54(7), 493–503.',
    url: 'https://doi.org/10.1037/0003-066X.54.7.493',
  },
  {
    id: 'F2',
    citation:
      'Gollwitzer y Sheeran (2006). Implementation intentions and goal achievement: A meta-analysis. Advances in Experimental Social Psychology, 38, 69–119.',
    url: 'https://doi.org/10.1016/S0065-2601(06)38002-1',
  },
  {
    id: 'F3',
    citation:
      'Wood y Neal (2007). A new look at habits and the habit–goal interface. Psychological Review, 114(4), 843–863.',
    url: 'https://doi.org/10.1037/0033-295X.114.4.843',
  },
  {
    id: 'F4',
    citation:
      'Lally, van Jaarsveld, Potts y Wardle (2010). How are habits formed. European Journal of Social Psychology, 40(6), 998–1009.',
    url: 'https://doi.org/10.1002/ejsp.674',
  },
  {
    id: 'F5',
    citation: 'James Clear (2018). Atomic Habits (Hábitos atómicos).',
    url: 'https://jamesclear.com/atomic-habits-summary',
  },
  {
    id: 'F6',
    citation: 'BJ Fogg (2009). A behavior model for persuasive design. Persuasive ’09, ACM.',
    url: 'https://behaviormodel.org',
  },
  { id: 'F7', citation: 'BJ Fogg (2019). Tiny Habits.', url: 'https://tinyhabits.com' },
  {
    id: 'F8',
    citation: 'Charles Duhigg (2012). The Power of Habit (El poder de los hábitos).',
    url: 'https://charlesduhigg.com/the-power-of-habit/',
  },
  {
    id: 'F9',
    citation:
      'Milkman, Minson y Volpp (2014). Holding the Hunger Games hostage at the gym. Management Science, 60(2), 283–299.',
    url: 'https://doi.org/10.1287/mnsc.2013.1784',
  },
  {
    id: 'F10',
    citation:
      'Ericsson, Krampe y Tesch-Römer (1993). The role of deliberate practice in the acquisition of expert performance. Psychological Review, 100(3), 363–406.',
  },
  {
    id: 'F11',
    citation:
      'Macnamara y Maitra (2019). The role of deliberate practice in expert performance: Revisiting Ericsson et al. (1993).',
    url: 'https://hhs.purdue.edu/skill-learning-and-performance-lab/wp-content/uploads/sites/43/2024/08/macnamara-maitra-2019-the-role-of-deliberate-practice-in-expert-performance-revisiting-ericsson-krampe-tesch-romer.pdf',
  },
  { id: 'F12', citation: 'Ericsson y Pool (2016). Peak: Secrets from the New Science of Expertise.' },
  {
    id: 'F13',
    citation: 'Roediger y Karpicke (2006). Test-enhanced learning. Psychological Science, 17(3), 249–255.',
    url: 'https://pubmed.ncbi.nlm.nih.gov/16507066/',
  },
  {
    id: 'F14',
    citation:
      'Cepeda, Pashler, Vul, Wixted y Rohrer (2006). Distributed practice in verbal recall tasks. Psychological Bulletin, 132(3), 354–380.',
    url: 'https://doi.org/10.1037/0033-2909.132.3.354',
  },
  {
    id: 'F15',
    citation:
      'Rohrer y Taylor (2007). The shuffling of mathematics problems improves learning. Instructional Science, 35, 481–498.',
  },
  {
    id: 'F16',
    citation:
      'Bjork (1994). Memory and metamemory considerations in the training of human beings. En Metacognition: Knowing about knowing, MIT Press, 185–205.',
  },
  { id: 'F17', citation: 'Brown, Roediger y McDaniel (2014). Make It Stick: The Science of Successful Learning.' },
  {
    id: 'F18',
    citation: 'Scott H. Young (2019). Ultralearning.',
    url: 'https://www.scotthyoung.com/blog/ultralearning/',
  },
  {
    id: 'F19',
    citation:
      'Locke y Latham (2002). Building a practically useful theory of goal setting and task motivation. American Psychologist, 57(9), 705–717.',
    url: 'https://doi.org/10.1037/0003-066X.57.9.705',
  },
  {
    id: 'F20',
    citation: 'Gabriele Oettingen (2014). Rethinking Positive Thinking (método WOOP).',
    url: 'https://woopmylife.org',
  },
  {
    id: 'F21',
    citation: 'Amabile y Kramer (2011). The power of small wins. Harvard Business Review.',
    url: 'https://hbswk.hbs.edu/item/6685.html',
  },
]

const byId = new Map(PRINCIPLES.map((principle) => [principle.id, principle]))

export function findPrinciple(id: string | undefined | null): Principle | undefined {
  return id ? byId.get(id.trim().toUpperCase()) : undefined
}

/** El id si es de un principio de la biblioteca; si no, `undefined` (la IA no puede inventar principios). */
export function principleId(id: string | undefined | null): string | undefined {
  return findPrinciple(id)?.id
}

/** Fuente corta para la etiqueta «Basado en»: el primer libro o autor del principio. */
export function shortSource(principle: Principle): string {
  const source = SOURCES.find((item) => item.id === principle.sources[0])
  return source ? source.citation.split('.')[0] : ''
}

/**
 * Bloque que se agrega a las instrucciones de la IA: los principios que aplican a esta tarea.
 * La IA debe basarse solo en ellos y decir cuál aplicó en cada elemento (`principle`).
 */
export function principlesPrompt(use: PrincipleUse | PrincipleUse[]): string {
  const uses = Array.isArray(use) ? use : [use]
  const list = PRINCIPLES.filter((principle) => principle.uses.some((item) => uses.includes(item)))
    .map((principle) => `- ${principle.id} · ${principle.name}: ${principle.idea} Aplicación: ${principle.apply}`)
    .join('\n')
  return `BIBLIOTECA DE PRINCIPIOS (tu única base de conocimiento sobre hábitos, aprendizaje y metas):
${list}

Basa tus decisiones SOLO en estos principios; no uses otros métodos ni inventes datos o estudios. En cada elemento que generes, pon en "principle" el id (por ejemplo "H4") del principio que más aplicaste.`
}
