import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { SlidersHorizontal } from 'lucide-react'
export default function PreferencePage() {
  return (
    <SettingsPlaceholder
      icon={SlidersHorizontal}
      title="Preference"
      description="System-wide preferences — language, display, notifications, and default behaviors."
      color="indigo"
      comingSoon={['Language & Locale', 'Date & Time Format', 'Default Tax Rate', 'Tip Settings', 'Notification Sounds', 'Auto-print Receipts', 'Order Numbering']}
    />
  )
}
