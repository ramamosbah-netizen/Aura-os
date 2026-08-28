import { permanentRedirect } from 'next/navigation';

// Compatibility route: approvals are owned by My Work, not a second Inbox surface.
export default function InboxPage(): never {
  permanentRedirect('/my-work/approvals');
}
