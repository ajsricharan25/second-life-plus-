import type { RepairCoach } from './research-types.ts'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function plain(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length >= 3 &&
    value.length <= max &&
    !/[\u0000-\u001f<>]|https?:|www\.|\[\d+\]/iu.test(value) &&
    !/[₹$€£¥]|\b(?:INR|USD|Rs\.?|rupees?|dollars?|euros?)\b|\d[\d.,]*\s*(?:kg|kilograms?|grams?|tonnes?|%)/iu.test(
      value,
    )
  )
}

/** Optional, compact model output; never substitute a preset recommendation. */
export function extractRepairCoach(value: unknown): RepairCoach | undefined {
  if (
    !record(value) ||
    !record(value.nextStep) ||
    !plain(value.nextStep.title, 100) ||
    !plain(value.nextStep.reason, 300) ||
    !Array.isArray(value.questions) ||
    value.questions.length > 3
  )
    return undefined
  const questions: RepairCoach['questions'] = []
  for (const item of value.questions) {
    if (!record(item) || !plain(item.question, 160) || !plain(item.why, 160)) return undefined
    const question = item.question.trim()
    if (questions.some((previous) => previous.question === question)) return undefined
    questions.push({ question, why: item.why.trim() })
  }
  return {
    nextStep: { title: value.nextStep.title.trim(), reason: value.nextStep.reason.trim() },
    questions,
  }
}

/** Three bounded observations fit the API's 1,200-character question limit. */
export function observationQuestion(coach: RepairCoach, answers: string[]): string {
  return coach.questions
    .flatMap((item, index) => {
      const answer = answers[index]?.trim().slice(0, 200)
      return answer ? [`${item.question}\nMy observation: ${answer}`] : []
    })
    .join('\n\n')
}
