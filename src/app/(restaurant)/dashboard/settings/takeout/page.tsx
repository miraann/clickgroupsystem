import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { ShoppingBag } from 'lucide-react'
export default function TakeoutPage() {
  return (
    <SettingsPlaceholder
      icon={ShoppingBag}
      title="Takeout"
      description="Manage takeout/pickup orders, preparation times, pickup slots, and QR ordering."
      color="emerald"
      comingSoon={['Takeout Toggle', 'Prep Time Estimate', 'Pickup Slots', 'Order Throttling', 'QR Code Ordering', 'Packaging Fees', 'Curbside Pickup']}
    />
  )
}
