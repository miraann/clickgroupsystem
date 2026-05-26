import { redirect } from 'next/navigation'

export default function AuditLogRedirect() {
  redirect('/dashboard/settings/audit-log')
}
