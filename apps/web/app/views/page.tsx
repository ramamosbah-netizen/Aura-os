import { redirect } from 'next/navigation';

// Saved views now live inside the unified Workspace hub.
export default function ViewsPage(): never {
  redirect('/workspace?tab=views');
}
