import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Database } from 'lucide-react'
export default function DatabasePage() {
  return (
    <SettingsPlaceholder
      icon={Database}
      title="Database"
      description="Backup, restore, data export, storage usage, and data retention policies."
      color="cyan"
      comingSoon={['Manual Backup', 'Scheduled Backup', 'Restore from Backup', 'Export All Data', 'Data Retention Policy', 'Storage Usage', 'Clear Old Records', 'GDPR Data Deletion']}
    />
  )
}
