import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { CreditCard } from 'lucide-react'
export default function PayLaterPage() {
  return (
    <SettingsPlaceholder
      icon={CreditCard}
      title="Pay Later"
      description="Credit accounts, deferred payments, customer credit limits, and outstanding balances."
      color="amber"
      comingSoon={['Customer Credit Accounts', 'Credit Limits', 'Outstanding Balance View', 'Payment Reminders', 'Credit History', 'Partial Payment Rules', 'Auto-close Credit Cycle']}
    />
  )
}
