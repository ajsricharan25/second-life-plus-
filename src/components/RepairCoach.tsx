import { useId, useState } from 'react'
import { ArrowRight, Compass } from 'lucide-react'
import type { RepairCoach as Coach } from '../lib/research-types'
import { observationQuestion } from '../lib/repair-coach'

export default function RepairCoach({
  coach,
  disabled,
  updated,
  onObserve,
}: {
  coach: Coach
  disabled: boolean
  updated: boolean
  onObserve: (question: string) => Promise<boolean | undefined>
}) {
  const id = useId()
  const [answers, setAnswers] = useState<string[]>([])
  const question = observationQuestion(coach, answers)
  return (
    <section className="repair-coach" aria-labelledby={`${id}-title`}>
      <div className="eyebrow">
        <Compass size={17} /> {updated ? 'UPDATED AI NEXT STEP' : 'YOUR AI NEXT STEP'}
      </div>
      <h5 id={`${id}-title`}>{coach.nextStep.title}</h5>
      <p>{coach.nextStep.reason}</p>
      <p className="coach-caveat">
        A suggested next step, based on your report. The fault still needs confirmation.
      </p>
      {coach.questions.length > 0 && (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (question && (await onObserve(question))) setAnswers([])
          }}
        >
          <h5>Narrow it down with what you’ve noticed</h5>
          <p>
            Share what you already know. Leave unknown answers blank; no need to perform a new test.
          </p>
          {coach.questions.map((item, index) => (
            <div className="coach-question" key={item.question}>
              <label htmlFor={`${id}-${index}`}>{item.question}</label>
              <small id={`${id}-${index}-why`}>{item.why}</small>
              <input
                id={`${id}-${index}`}
                aria-describedby={`${id}-${index}-why`}
                value={answers[index] ?? ''}
                maxLength={200}
                placeholder="What you noticed, or ‘not sure’"
                onChange={(event) =>
                  setAnswers((previous) => {
                    const next = [...previous]
                    next[index] = event.target.value
                    return next
                  })
                }
              />
            </div>
          ))}
          <button type="submit" className="button button-primary" disabled={disabled || !question}>
            Refine with my observations <ArrowRight size={16} />
          </button>
          <small className="coach-usage">Sends your answers together · Uses 1 AI action</small>
        </form>
      )}
    </section>
  )
}
