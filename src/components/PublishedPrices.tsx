import type { PublishedPrice, ResearchRequest, ResearchResult } from '../lib/research-types'
import { formatMoney } from '../lib/estimator'
import { comparePublishedPrices } from '../lib/price-comparison'

const labels: Record<PublishedPrice['kind'], string> = {
  part: 'Component / spare part only',
  labor: 'Labour / diagnostic fee',
  'total-repair': 'Published total repair',
  replacement: 'New whole-device price',
}

export default function PublishedPrices({
  result,
  request,
}: {
  result: ResearchResult
  request: ResearchRequest
}) {
  const check = result.priceCheck
  const comparison = comparePublishedPrices(result, request.currency, request.replacementCost)
  return (
    <section className="published-prices" aria-labelledby="price-check-title">
      <h4 id="price-check-title">Source-backed price check</h4>
      {check?.status === 'checked' && check.items.length > 0 ? (
        <>
          <ul className="published-price-list">
            {check.items.map((item, index) => (
              <li key={index}>
                <span>{labels[item.kind]}</span>
                <strong>
                  {formatMoney(item.low, item.currency)}
                  {item.high !== item.low && `–${formatMoney(item.high, item.currency)}`}
                </strong>
                <small>
                  {item.modelMatch === 'exact'
                    ? 'Your model appears in the cited price'
                    : 'General example; your model may cost more or less'}
                </small>
                {item.kind === 'part' && (
                  <p>
                    Full repair quote needed. Labour and other charges are not established by this
                    component price.
                  </p>
                )}
                <details>
                  <summary>See the price evidence</summary>
                  <blockquote>{item.excerpt}</blockquote>
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    {item.sourceTitle}
                  </a>
                </details>
              </li>
            ))}
          </ul>
          <p>
            Amounts are checked against the cited answer, not confirmed with a shop. Open the source
            to check availability, location, taxes, and conditions.
          </p>
        </>
      ) : (
        <p>
          <strong>Quote needed.</strong>{' '}
          {check?.status === 'checked'
            ? 'No clearly priced repair, part, or replacement could be extracted with supporting citations.'
            : 'The price check could not be completed. No verified amount is available for the calculator.'}
        </p>
      )}
      <div className="ai-cost-calculator" aria-label="AI-sourced cost calculator">
        <h4>Repair vs. replacement calculator</h4>
        {comparison.status === 'ready' ? (
          <>
            <p>
              {comparison.generalExample
                ? 'Comparison using published examples; these may describe other models or regions.'
                : 'Comparison using prices that name your model. Check the source region and conditions.'}
            </p>
            <dl>
              <div>
                <dt>Published full repair</dt>
                <dd>
                  {formatMoney(comparison.repair.low, comparison.currency)}–
                  {formatMoney(comparison.repair.high, comparison.currency)}
                </dd>
              </div>
              <div>
                <dt>
                  {comparison.replacementSource
                    ? 'Published new-device price'
                    : 'Your new-device budget'}
                </dt>
                <dd>
                  {formatMoney(comparison.replacement.low, comparison.currency)}–
                  {formatMoney(comparison.replacement.high, comparison.currency)}
                </dd>
              </div>
              <div>
                <dt>Repair as a share of replacement</dt>
                <dd>
                  {comparison.percentage.low}–{comparison.percentage.high}%
                </dd>
              </div>
            </dl>
            <a href={comparison.repair.sourceUrl} target="_blank" rel="noreferrer">
              Repair price source
            </a>
            {comparison.replacementSource && (
              <>
                {' '}
                ·{' '}
                <a href={comparison.replacementSource.sourceUrl} target="_blank" rel="noreferrer">
                  Replacement price source
                </a>
              </>
            )}
            <p>
              This calculation uses those prices, not the offline assumptions. The AI assessment
              above explains the trade-offs; the percentage alone does not establish a fault or a
              final bill.
            </p>
          </>
        ) : (
          <p>
            {comparison.status === 'missing-repair'
              ? 'A complete repair price in your selected currency is not established. Component-only prices cannot determine a full repair bill.'
              : 'A new-device price in your selected currency is missing. Enter a replacement budget in Edit details or research a specific replacement model to compare.'}
          </p>
        )}
      </div>
    </section>
  )
}
