import { redirect } from 'next/navigation';

// Forecast is deliberately NOT a standalone page yet. Until the Pipeline structure is settled — and
// until winProbability, close-date and stage semantics are proven reliable in the data — forecast
// and analysis live inside the Pipeline workspace's analysis tab. A dedicated Forecast space is a
// LATER slice (Forecast = future expectation; Analytics = historical performance).
export default function ForecastRedirect() {
  redirect('/crm/leads?tab=analytics');
}
