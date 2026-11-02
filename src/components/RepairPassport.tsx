import type { DeviceInput } from '../lib/device'
import { getDeviceName } from '../lib/device'
import type { SavedReport } from '../lib/research-types'
import { CitedAnswer } from './WebResearchPanel'

export default function RepairPassport({
  input,
  brandModel,
  location,
  report,
}: {
  input: DeviceInput
  brandModel: string
  location: string
  report: SavedReport
}) {
  return (
    <article className="print-passport" aria-label="Printable repair passport">
      <header>
        <p>secondlife. · REPAIR PASSPORT</p>
        <h1>{brandModel || getDeviceName(input)}</h1>
        <p>
          {getDeviceName(input)} · {input.age} years old · {input.currency}
        </p>
        <p>
          <strong>Reported symptoms:</strong> {input.symptoms}
        </p>
        <p>
          <strong>Search area:</strong> {location || 'Not supplied'}
        </p>
        <p>
          AI guidance for a repair discussion. Faults, compatibility and final charges need
          professional confirmation. Amounts labelled AI estimates are planning ranges, not quotes
          or guaranteed recycler payouts. Sources and prices may change.
        </p>
      </header>
      {[
        { title: 'Device assessment', question: undefined, result: report.result },
        ...report.history,
      ].map((item, index) => (
        <section key={index} className="passport-entry">
          <h2>{item.title}</h2>
          <p>
            Generated: {new Date(item.result.checkedAt).toLocaleString()} ·{' '}
            {item.result.provider ?? 'AI provider'} ·{' '}
            {item.result.evidence === 'model-only' ? 'No web check' : 'Search sources included'}
          </p>
          {item.question && (
            <p className="passport-observations">
              <strong>Owner’s observations / question:</strong>
              {'\n'}
              {item.question}
            </p>
          )}
          <CitedAnswer result={item.result} context={`${index + 1}: ${item.title}`} print />
        </section>
      ))}
      <footer>
        Prepared by Second Life from owner-provided details and API responses. No photo is included
        in this copy.
      </footer>
    </article>
  )
}
