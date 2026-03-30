import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { UserCircle } from 'lucide-react'
export default function CustomerPage() {
  return (
    <SettingsPlaceholder
      icon={UserCircle}
      title="Customer"
      description="Customer profiles, visit history, preferences, contact capture, and CRM settings."
      color="violet"
      comingSoon={['Customer Profiles', 'Visit & Order History', 'Contact Capture at Checkout', 'Customer Tags', 'Blacklist Management', 'Birthday Tracking', 'Customer Notes', 'Export Customer Data']}
    />
  )
}
