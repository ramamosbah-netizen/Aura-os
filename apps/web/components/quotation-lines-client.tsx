'use client';

import { type CSSProperties, Fragment, useState } from 'react';
import { RegisterKpis, RegisterPanel, registerTable } from './ui/register-view';
import TechnicalEvaluationPanel from './technical-evaluation-panel';

interface QuotationLine {
  id: string;
  prLineId: string;
  response: 'quoted' | 'no_bid';
  offeredManufacturer: string | null;
  offeredModel: string | null;
  isAlternate: boolean;
  complianceResponse: string | null;
  quantity: number | null;
  uom: string | null;
  unitPrice: number | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
}

/**
 * A supplier's offer line by line, each opening onto its technical evaluation.
 *
 * The compliance column shows the SUPPLIER'S OWN RESPONSE and says so. It is never styled as a pass:
 * a screen that renders "comply" as a tick is how a supplier's claim becomes a verdict without
 * anybody deciding anything.
 */
export default function QuotationLinesClient({ quotationId, lines }: { quotationId: string; lines: QuotationLine[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const quoted = lines.filter((l) => l.response === 'quoted');
  const declined = lines.filter((l) => l.response === 'no_bid');

  return (
    <div>
      <RegisterKpis
        items={[
          { label: 'Requirements answered', value: String(lines.length) },
          { label: 'Offered', value: String(quoted.length) },
          { label: 'Declined', value: String(declined.length), tone: declined.length > 0 ? 'warn' : undefined },
        ]}
      />

      {lines.length === 0 ? (
        <RegisterPanel scroll={false}>
          <p style={st.muted}>This supplier has not answered any requirement yet.</p>
        </RegisterPanel>
      ) : (
        <RegisterPanel testId="quotation-lines">
          <table style={registerTable.table}>
            <thead>
              <tr>
                {['Offered', 'Quantity', 'Unit price', 'Lead time', 'Warranty', 'Supplier states', ''].map((h) => (
                  <th key={h} style={registerTable.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <Fragment key={l.id}>
                  <tr>
                    <td style={registerTable.td}>
                      {l.response === 'no_bid'
                        ? <span style={st.declined}>Declined</span>
                        : <>{l.offeredManufacturer ?? '—'} {l.offeredModel ?? ''}
                            {l.isAlternate && <span style={st.alt}>alternate</span>}</>}
                    </td>
                    <td style={registerTable.tdMuted}>{l.quantity ?? '—'} {l.uom ?? ''}</td>
                    <td style={registerTable.tdMuted}>{l.unitPrice ?? '—'}</td>
                    <td style={registerTable.tdMuted}>{l.leadTimeDays != null ? `${l.leadTimeDays} d` : '—'}</td>
                    <td style={registerTable.tdMuted}>{l.warrantyMonths != null ? `${l.warrantyMonths} mo` : '—'}</td>
                    <td style={registerTable.tdMuted} data-testid={`claim-${l.id}`}>
                      {/* The supplier's words, labelled. Never a tick. */}
                      {l.complianceResponse ? l.complianceResponse.replace(/_/g, ' ') : '—'}
                    </td>
                    <td style={registerTable.td}>
                      {l.response === 'quoted' && (
                        <button type="button" className="btn btn-ghost" style={st.sm}
                          onClick={() => setOpenId(openId === l.id ? null : l.id)}
                          data-testid={`evaluate-toggle-${l.id}`}>
                          {openId === l.id ? 'Hide' : 'Technical verdict'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {openId === l.id && (
                    <tr>
                      <td style={st.detailCell} colSpan={7}>
                        <TechnicalEvaluationPanel quotationLineId={l.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </RegisterPanel>
      )}
      <p style={st.hint}>Quotation {quotationId}</p>
    </div>
  );
}

const st = {
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  declined: { color: 'var(--muted)', fontStyle: 'italic' } as CSSProperties,
  alt: { marginLeft: 6, fontSize: 10.5, border: '1px solid var(--warn-soft)', color: 'var(--warn)', borderRadius: 999, padding: '0 6px' } as CSSProperties,
  sm: { padding: '4px 10px', fontSize: 12 } as CSSProperties,
  detailCell: { background: 'var(--panel-2)', padding: '12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  hint: { color: 'var(--muted)', fontSize: 11, marginTop: 14 } as CSSProperties,
};
