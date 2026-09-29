import type { Question } from './types'

const files = import.meta.glob<Question[]>('./cats/*.json', { eager: true, import: 'default' })

/** Every question in the bank, grouped files flattened (most-asked first within a category). */
export const allQuestions: Question[] = Object.values(files).flat()
