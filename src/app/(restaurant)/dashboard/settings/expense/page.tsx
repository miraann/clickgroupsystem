import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { DollarSign } from 'lucide-react'
export default function ExpensePage() {
  return (
    <SettingsPlaceholder
      icon={DollarSign}
      title="Expense"
      description="Track operational expenses, supplier payments, petty cash, and cost categories."
      color="rose"
      comingSoon={['Expense Categories', 'Supplier Management', 'Petty Cash Tracking', 'Recurring Expenses', 'Expense Approval', 'Purchase Orders', 'Cost of Goods']}
    />
  )
}
