import { describe, expect, it } from 'vitest'
import { extractRepairCoach, observationQuestion } from './repair-coach'
import { parseResearchResult } from './research-client'
import { guidance } from '../../tests/unified-fixture'

const coach = {
  nextStep: {
    title: 'Arrange a drain-path diagnosis',
    reason: 'The reported symptoms do not establish an internal pump fault.',
  },
  questions: [
    {
      question: 'Did you notice an error code?',
      why: 'A code may distinguish drainage from control faults.',
    },
  ],
}
describe('API next-step guidance', () => {
  it('accepts bounded model guidance and supports older reports without it', () => {
    expect(extractRepairCoach(coach)).toEqual(coach)
    expect(parseResearchResult({ ...guidance, coach }).coach).toEqual(coach)
    expect(parseResearchResult(guidance).coach).toBeUndefined()
  })
  it.each([
    null,
    {},
    { ...coach, questions: [...coach.questions, ...coach.questions] },
    { ...coach, nextStep: { title: 'Pay ₹500 now', reason: 'This is a confirmed price.' } },
    { ...coach, questions: [{ question: 'x'.repeat(161), why: 'Some reason' }] },
    { ...coach, nextStep: { ...coach.nextStep, reason: 'Read https://untrusted.example' } },
  ])('omits malformed optional guidance without inventing a substitute', (value) => {
    expect(extractRepairCoach(value)).toBeUndefined()
    expect(() => parseResearchResult({ ...guidance, coach: value })).toThrow()
  })
  it('batches only answered questions within the existing API input bound', () => {
    const maximum = {
      ...coach,
      questions: [1, 2, 3].map((i) => ({
        question: `${i}${'q'.repeat(159)}`,
        why: 'Explain the observation.',
      })),
    }
    const question = observationQuestion(maximum, [
      'a'.repeat(200),
      'b'.repeat(200),
      'c'.repeat(200),
    ])
    expect(question.length).toBeLessThanOrEqual(1200)
    expect(observationQuestion(coach, ['  '])).toBe('')
    expect(observationQuestion(coach, ['Not sure'])).toContain('My observation: Not sure')
  })
})
