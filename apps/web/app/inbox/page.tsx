import { redirect } from 'next/navigation';

// The approvals inbox now lives inside the unified Workspace hub.
export default function InboxPage(): never {
  redirect('/workspace?tab=inbox');
}
