import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { BarChart3 } from 'lucide-react'
export default function ReportSettingsPage() {
  return (
    <SettingsPlaceholder
      icon={BarChart3}
      title="Report"
      description="Configure report schedules, end-of-day summaries, email exports, and report access by role."
      color="indigo"
      comingSoon={['End-of-Day Report', 'Scheduled Email Reports', 'Report Access by Role', 'Sales Summary Format', 'Custom Date Ranges', 'Export to CSV / PDF', 'Tax Report']}
    />
  )
}
