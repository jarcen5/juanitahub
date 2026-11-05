/** Original, short Juanita Quest games that staff may assign independently. */
export type MiniGameKind = 'block_builder' | 'word_workshop' | 'color_by_math' | 'letter_landing'

export type MiniGameQuestion = {
  id: string
  type: 'multiple_choice'
  prompt: string
  correct_answer: string
  choices?: string[]
  target_number?: number
  word_start?: string
  word_picture?: string
  picture?: string
  spoken_prompt?: string
}

export type MiniGameConfig = {
  experience: 'juanita_mini_game'
  mini_game: MiniGameKind
  questions: MiniGameQuestion[]
  passing_score: number
  show_explanations: boolean
}

export type MiniGameTemplate = {
  title: string
  subject: 'reading' | 'math'
  assignment_type: 'quiz'
  skill: string
  grade_levels: string[]
  difficulty: 'support'
  delivery_format: 'digital'
  instructions: string
  estimated_minutes: number
  resource_url: null
  starter_config: MiniGameConfig
}

const numberQuestion = (number: number): MiniGameQuestion => ({
  id: 'blocks-' + number,
  type: 'multiple_choice',
  prompt: 'Build ' + number + ' blocks',
  correct_answer: String(number),
  target_number: number,
})

const wordQuestion = (id: string, picture: string, start: string, ending: string, options: string[]): MiniGameQuestion => ({
  id: 'word-' + id,
  type: 'multiple_choice',
  prompt: 'Finish the word',
  spoken_prompt: 'Look at the picture. Build the word ' + id + '.',
  word_picture: picture,
  word_start: start,
  correct_answer: ending,
  choices: options,
})

const letterQuestion = (id: string, picture: string, letter: string, options: string[]): MiniGameQuestion => ({
  id: 'letter-' + id,
  type: 'multiple_choice',
  prompt: 'What letter starts ' + id + '?',
  spoken_prompt: 'Listen. ' + id + '. What letter starts ' + id + '?',
  picture,
  correct_answer: letter,
  choices: options,
})

const painting = [
  { answer: 1, problem: '0 + 1' }, { answer: 3, problem: '1 + 2' }, { answer: 1, problem: '1 + 0' },
  { answer: 3, problem: '2 + 1' }, { answer: 4, problem: '2 + 2' }, { answer: 3, problem: '1 + 2' },
  { answer: 1, problem: '0 + 1' }, { answer: 2, problem: '1 + 1' }, { answer: 1, problem: '1 + 0' },
]

export const colorByMathPalette = [
  { number: 1, name: 'Sky', color: '#86cef4' },
  { number: 2, name: 'Leaf', color: '#54b978' },
  { number: 3, name: 'Petal', color: '#f5ce57' },
  { number: 4, name: 'Middle', color: '#f28b56' },
] as const

export const miniGameTemplates: MiniGameTemplate[] = [
  {
    title: 'Juanita Quest: Block Builder',
    subject: 'math',
    assignment_type: 'quiz',
    skill: 'Count objects and build numbers 1–6',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Build each number with blocks. Tap or drag blocks into the play area, then check your work.',
    estimated_minutes: 4,
    resource_url: null,
    starter_config: {
      experience: 'juanita_mini_game',
      mini_game: 'block_builder',
      passing_score: 75,
      show_explanations: false,
      questions: [2, 4, 1, 5, 3, 6].map(numberQuestion),
    },
  },
  {
    title: 'Juanita Quest: Word Workshop',
    subject: 'reading',
    assignment_type: 'quiz',
    skill: 'Read and build short consonant-vowel-consonant words',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Look at the picture and put the right ending on the word. Tap or drag the endings to build words.',
    estimated_minutes: 5,
    resource_url: null,
    starter_config: {
      experience: 'juanita_mini_game',
      mini_game: 'word_workshop',
      passing_score: 75,
      show_explanations: false,
      questions: [
        wordQuestion('cat', '🐱', 'c', 'at', ['at','og','un']),
        wordQuestion('sun', '☀️', 's', 'un', ['ig','un','at']),
        wordQuestion('dog', '🐶', 'd', 'og', ['og','at','en']),
        wordQuestion('hat', '🧢', 'h', 'at', ['un','at','ig']),
        wordQuestion('pig', '🐷', 'p', 'ig', ['ig','og','un']),
      ],
    },
  },
  {
    title: 'Juanita Quest: Color by Math',
    subject: 'math',
    assignment_type: 'quiz',
    skill: 'Add within 4 and match answers to colors',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Choose a color number and tap the math squares to paint a flower.',
    estimated_minutes: 5,
    resource_url: null,
    starter_config: {
      experience: 'juanita_mini_game',
      mini_game: 'color_by_math',
      passing_score: 75,
      show_explanations: false,
      questions: painting.map((cell, index) => ({
        id: 'flower-' + (index + 1),
        type: 'multiple_choice',
        prompt: cell.problem,
        correct_answer: String(cell.answer),
      })),
    },
  },
  {
    title: 'Juanita Quest: Letter Landing',
    subject: 'reading',
    assignment_type: 'quiz',
    skill: 'Recognize beginning letters with picture and spoken-word clues',
    grade_levels: [],
    difficulty: 'support',
    delivery_format: 'digital',
    instructions: 'Hear a word, look at its picture, and land on the letter it starts with.',
    estimated_minutes: 4,
    resource_url: null,
    starter_config: {
      experience: 'juanita_mini_game',
      mini_game: 'letter_landing',
      passing_score: 75,
      show_explanations: false,
      questions: [
        letterQuestion('sun', '☀️', 's', ['s','m','t']),
        letterQuestion('moon', '🌙', 'm', ['p','m','c']),
        letterQuestion('cat', '🐱', 'c', ['t','s','c']),
        letterQuestion('ball', '🏀', 'b', ['d','b','p']),
        letterQuestion('fish', '🐟', 'f', ['s','f','m']),
        letterQuestion('tree', '🌳', 't', ['t','c','b']),
      ],
    },
  },
]

export const miniGameLabels: Record<MiniGameKind, { icon: string; label: string; color: string }> = {
  block_builder: { icon: '🧱', label: 'Block Builder', color: '#f0a444' },
  word_workshop: { icon: '🔤', label: 'Word Workshop', color: '#a88bfb' },
  color_by_math: { icon: '🎨', label: 'Color by Math', color: '#ef8497' },
  letter_landing: { icon: '🚀', label: 'Letter Landing', color: '#6ec5ca' },
}
