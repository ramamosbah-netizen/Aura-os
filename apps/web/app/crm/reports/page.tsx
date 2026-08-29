import { redirect } from 'next/navigation';

// Sales reporting is the Pipeline workspace's Analytics tab — consolidated here so performance
// analysis has one home instead of a parallel page.
export default function ReportsRedirect() {
  redirect('/crm/analytics?view=performance');
}
