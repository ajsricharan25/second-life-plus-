import type { ReactNode } from 'react'
import type { CostEstimate, ResearchResult } from '../lib/research-types'
import { formatMoney } from '../lib/estimator'
import { comparePublishedPrices } from '../lib/price-comparison'

const labels: Record<CostEstimate['kind'] | 'replacement', string> = {
  part: 'Component / part',
  labor: 'Labour',
  inspection: 'Inspection / visit',
  'total-repair': 'Complete repair',
  replacement: 'New whole device',
  material: 'Potential material value',
  'device-scrap': 'Whole-device scrap payment',
  'recycling-fee': 'Collection / disposal fee — you pay',
}
function moneyRange(low: number, high: number, currency: 'INR' | 'USD') {
  return low === high
    ? formatMoney(low, currency)
    : `${formatMoney(low, currency)}–${formatMoney(high, currency)}`
}

export default function CostTable({
  result,
  category,
  context = 'Device assessment',
}: {
  result: ResearchResult
  category: 'repair' | 'recycling'
  context?: string
}) {
  const repair = category === 'repair'
  const title = repair ? 'Repair cost estimates' : 'Recycling value estimates'
  const currency = result.priceCheck?.items.find((price) => price.kind === 'total-repair')?.currency
  const comparison = repair && currency ? comparePublishedPrices(result, currency) : null
  const rows: ReactNode[] = []
  if (repair) {
    for (const [index, price] of (result.priceCheck?.items ?? []).entries()) {
      rows.push(
        <tr key={`price-${index}`}>
          <th scope="row">{labels[price.kind]}</th>
          <td className="cost-amount">{moneyRange(price.low, price.high, price.currency)}</td>
          <td>
            <span className="cost-basis published">Published price</span>
          </td>
          <td>
            {price.excerpt}
            <small>
              {price.modelMatch === 'exact'
                ? 'Model matched in source.'
                : 'General example; model compatibility is unconfirmed.'}
            </small>
            <a href={price.sourceUrl} target="_blank" rel="noreferrer">
              View price source
            </a>
          </td>
        </tr>,
      )
    }
  } else {
    for (const [index, material] of (result.materials ?? []).entries()) {
      const value =
        material.weightKg !== null && material.ratePerKg !== null
          ? formatMoney(material.weightKg * material.ratePerKg, material.currency)
          : 'Not established'
      rows.push(
        <tr key={`material-${index}`}>
          <th scope="row">
            {material.name}
            <small>Gross material value</small>
          </th>
          <td className="cost-amount">{value}</td>
          <td>
            <span className="cost-basis published">Published evidence</span>
          </td>
          <td>
            {material.excerpt}
            <small>
              Quantity: {material.weightKg === null ? 'unconfirmed' : `${material.weightKg} kg`}.{' '}
              Rate:{' '}
              {material.ratePerKg === null
                ? 'unconfirmed'
                : `${formatMoney(material.ratePerKg, material.currency)}/kg`}
              .
            </small>
            <a href={material.sourceUrl} target="_blank" rel="noreferrer">
              View material source
            </a>
          </td>
        </tr>,
      )
    }
  }
  for (const [index, estimate] of (result.costEstimates?.[category] ?? []).entries()) {
    rows.push(
      <tr
        key={`estimate-${index}`}
        className={
          ['total-repair', 'device-scrap'].includes(estimate.kind) ? 'cost-total' : undefined
        }
      >
        <th scope="row">
          {estimate.item}
          <small>{labels[estimate.kind]}</small>
        </th>
        <td className="cost-amount">
          {moneyRange(estimate.low, estimate.high, estimate.currency)}
        </td>
        <td>
          <span className="cost-basis">AI estimate</span>
        </td>
        <td>{estimate.assumptions}</td>
      </tr>,
    )
  }
  return (
    <section className="report-costs" aria-label={`${title} — ${context}`}>
      <p className="cost-scroll-hint">Swipe across the table for assumptions and source details.</p>
      <div
        className="cost-table-scroll"
        role="region"
        aria-label={`${title} table — ${context}; scroll horizontally if needed`}
        tabIndex={0}
      >
        <table className="report-cost-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">{repair ? 'Repair item' : 'Material / route'}</th>
              <th scope="col">{repair ? 'Cost / range' : 'Value / range'}</th>
              <th scope="col">Basis</th>
              <th scope="col">{repair ? 'What it covers' : 'Assumptions / conditions'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows
            ) : (
              <tr>
                <td colSpan={4}>
                  The AI did not return a usable {repair ? 'repair cost' : 'recycling value'} for
                  this assessment. No preset amount has been substituted.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {comparison?.status === 'ready' && (
        <p className="research-price-note">
          Using the published amounts, repair is {comparison.percentage.low}–
          {comparison.percentage.high}% of replacement.
          {comparison.generalExample
            ? ' These are general examples, not necessarily your model or region.'
            : ' Check source conditions and local availability.'}
        </p>
      )}
      <p className="research-price-note">
        {repair
          ? 'AI estimates are rough planning ranges, not verified shop quotes. A complete-repair row covers the whole job; do not add it again to parts and labour. Check each row’s inclusions for taxes, visits and part quality.'
          : 'AI estimates assume unmeasured composition and uncertain recovery. Material rows show potential gross value, not cash you will receive. Whole-device payment is a separate estimate; do not add the rows together. Collection or disposal fees are amounts you may pay.'}
      </p>
    </section>
  )
}
