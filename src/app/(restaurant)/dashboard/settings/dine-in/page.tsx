import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Coffee } from 'lucide-react'
export default function DineInPage() {
  return (
    <SettingsPlaceholder
      icon={Coffee}
      title="Dine In"
      description="Table management, floor layout, sections, covers, and dine-in service settings."
      color="amber"
      comingSoon={['Floor Plan Editor', 'Table Sections', 'Cover Count', 'Auto-close Tables', 'Table Merge / Split', 'Course-based Ordering', 'Guest Paging']}
    />
  )
}
