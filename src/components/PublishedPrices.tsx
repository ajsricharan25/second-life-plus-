import type { PublishedPrice, ResearchResult } from '../lib/research-types'
import { formatMoney } from '../lib/estimator'

const labels: Record<PublishedPrice['kind'], string> = {
  part: 'Component / spare part only',
  labor: 'Labour / diagnostic fee',
  'total-repair': 'Published total repair',
  replacement: 'New whole-device price',
}

export default function PublishedPrices({ result }: { result: ResearchResult }) {
  const check = result.priceCheck
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
            : 'The price check could not be completed. The planning allowance above remains unverified.'}
        </p>
      )}
    </section>
  )
}
