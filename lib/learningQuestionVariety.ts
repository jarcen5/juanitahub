/** Reproducible, per-attempt question and answer-order rotation.
 *  Used for low-stakes independent practice; server still scores by original bank IDs.
 *  A real secure examination would require server-delivered unseen questions.
 */
export type RotatingQuestion = {
  id: string
  type: string
  prompt: string
  choices?: string[]
  correct_answer: string
  explanation?: string
  passage?: string
}
export type RotationConfig = {
  questions?: RotatingQuestion[]
  rotate_questions?: boolean
  questions_per_attempt?: number
}

function stringSeed(value: string): number {
  let seed = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    seed ^= value.charCodeAt(i)
    seed = Math.imul(seed, 16777619)
  }
  return seed >>> 0
}
function makeRandom(seed: number) {
  let x = seed >>> 0
  return () => {
    x += 0x6d2b79f5
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function shuffleCopy<T>(values: T[], random: () => number): T[] {
  const items = [...values]
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}
export function effectiveQuestionCount(config: RotationConfig | null | undefined): number {
  const bankSize = config?.questions?.length ?? 0
  if (!config?.rotate_questions || !bankSize) return bankSize
  const requested = Number(config.questions_per_attempt)
  return Number.isInteger(requested) && requested > 0
    ? Math.min(bankSize, requested) : bankSize
}
export function selectRotatingQuestions<T extends RotatingQuestion>(
  config: (RotationConfig & { questions?: T[] }) | null | undefined,
  attemptSeed: string,
): T[] {
  const bank = config?.questions ?? []
  if (!config?.rotate_questions) return bank
  const count = effectiveQuestionCount(config)
  const random = makeRandom(stringSeed(attemptSeed))
  const sampled = shuffleCopy(bank, random).slice(0, count)
  return sampled.map((question) => ({
    ...question,
    choices: question.choices?.length
      ? shuffleCopy(question.choices, makeRandom(stringSeed(attemptSeed + '|' + question.id + '|choices')))
      : question.choices,
  }))
}

export function validateQuestionBank(config: RotationConfig): string[] {
  const errors: string[] = []
  const questions = config.questions ?? []
  const ids = new Set<string>()
  const prompts = new Set<string>()
  for (const [index, question] of questions.entries()) {
    const prefix = 'Question ' + (index + 1)
    if (!question.id || ids.has(question.id)) errors.push(prefix + ' needs a unique ID')
    ids.add(question.id)
    const promptKey = (question.passage ?? '').trim().toLowerCase() + '|' + question.prompt.trim().toLowerCase()
    if (prompts.has(promptKey)) errors.push(prefix + ' repeats another question with the same passage and wording')
    prompts.add(promptKey)
    if (!question.prompt.trim() || !question.correct_answer.trim()) errors.push(prefix + ' needs a question and correct answer')
    if (question.choices?.length) {
      const normalized = question.choices.map(c => c.trim().toLocaleLowerCase())
      if (new Set(normalized).size !== normalized.length) errors.push(prefix + ' has duplicate choices')
      if (!normalized.includes(question.correct_answer.trim().toLocaleLowerCase())) errors.push(prefix + ' answer is not among the choices')
    }
  }
  if (config.rotate_questions) {
    const count = config.questions_per_attempt
    if (!Number.isInteger(count) || !count || count < 1 || count > questions.length) {
      errors.push('Choose a valid number of questions per attempt')
    } else if (questions.length < count + 3) {
      errors.push('Add at least 3 more questions than the number shown per attempt so repeats actually vary')
    }
  }
  return errors
}
