import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Settings2 } from 'lucide-react'
export default function AdvancedPage() {
  return (
    <SettingsPlaceholder
      icon={Settings2}
      title="Advanced"
      description="Developer options, integrations, webhooks, API access, and experimental features."
      color="rose"
      comingSoon={['API Access Keys', 'Webhooks', 'Third-party Integrations', 'Accounting Export (QuickBooks)', 'Offline Mode Settings', 'Data Sync Frequency', 'Feature Flags', 'Audit Log']}
    />
  )
}
