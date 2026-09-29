/** Bank question id → challenge id, from the small meta files only. */
const metas = import.meta.glob<{ bank?: string }>('/challenges/*/meta.json', { import: 'default', eager: true })

export const challengeByBank: Record<string, string> = {}
for (const [path, m] of Object.entries(metas)) if (m.bank) challengeByBank[m.bank] = path.split('/')[2]
