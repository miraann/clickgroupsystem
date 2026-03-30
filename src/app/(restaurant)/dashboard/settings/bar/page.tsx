import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Wine } from 'lucide-react'
export default function BarPage() {
  return (
    <SettingsPlaceholder
      icon={Wine}
      title="Bar"
      description="Bar tab management, drink modifiers, happy hour pricing, and tab settings."
      color="violet"
      comingSoon={['Bar Tabs', 'Happy Hour Rules', 'Drink Modifiers', 'Age Verification Prompt', 'Tab Auto-close', 'Bar Sections', 'Drink Recipes']}
    />
  )
}
