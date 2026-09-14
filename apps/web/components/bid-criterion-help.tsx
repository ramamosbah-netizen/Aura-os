'use client';

import { useEffect, useState } from 'react';
import styles from './bid-criterion-help.module.css';

const guidance: Record<string, string> = {
  'Strategic fit': 'How well this tender matches our target markets, services and growth plans. Consider sector, location, project size and long-term value. Score 0–3 for poor alignment, 4–6 for partial alignment, and 7–10 for strong alignment.',
  'Client relationship & payment history': 'How confident we are in the client relationship and timely payment. Review past payments, disputes, references and agreed payment terms. Score 0–3 for serious concerns, 4–6 for mixed or limited evidence, and 7–10 for a reliable relationship and payment record.',
  'Technical capability & capacity': 'Whether we have the skills, certifications, people and available capacity to deliver the specified work on time. Score 0–3 for major gaps, 4–6 for gaps needing a credible plan, and 7–10 for proven capability and available resources.',
  'Win probability vs competition': 'Our assessed competitiveness: relevant experience, differentiation, client access and likely competing bidders. Score 0–3 for a weak position, 4–6 for a credible but uncertain position, and 7–10 for a strong position. This is a judgement score, not a calculated percentage chance of winning.',
  'Margin potential': 'The early outlook for profitable delivery, considering likely market price, scope clarity, cost pressures and contingencies. Score 0–3 for weak potential, 4–6 for uncertain or modest potential, and 7–10 for strong potential supported by evidence. This is a qualification judgement, not a BOQ estimate or calculated margin.',
  'Contract & delivery risk': 'How manageable the contract terms, liabilities, programme, access and delivery dependencies are. Higher means safer: score 0–3 for severe or uncontrolled risk, 4–6 for risk needing mitigation, and 7–10 for low or well-controlled risk.',
};

export default function BidCriterionHelp({ name, score, weight, totalWeight, id }: { name: string; score: number; weight: number; totalWeight: number; id: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  const contribution = totalWeight > 0 ? score * weight / totalWeight * 10 : 0;
  return <span className={styles.help} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" className={styles.label} aria-expanded={open} aria-controls={id}
      aria-describedby={open ? id : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>{name} <span aria-hidden>ⓘ</span></button>
    {open && <span id={id} role="tooltip" className={styles.tooltip}>
      <strong>{name}</strong><span>{guidance[name] ?? 'Score this criterion from 0 to 10 using the available evidence.'}</span>
      <span>You enter the score; weight sets its relative importance. Contribution = score × weight ÷ total weight × 10.</span>
      <span>{totalWeight > 0 ? `Now: ${score} × ${weight} ÷ ${totalWeight} × 10 = ${contribution.toFixed(2)} points out of 100.` : 'Total weight is zero, so the total and all contributions are zero.'} A weight of zero excludes this criterion.</span>
    </span>}
  </span>;
}
