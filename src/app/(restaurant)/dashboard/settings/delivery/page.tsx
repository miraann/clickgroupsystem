import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Truck } from 'lucide-react'
export default function DeliveryPage() {
  return (
    <SettingsPlaceholder
      icon={Truck}
      title="Delivery"
      description="Configure delivery zones, fees, minimum orders, drivers, and third-party integrations."
      color="indigo"
      comingSoon={['Delivery Zones', 'Delivery Fees', 'Minimum Order', 'Estimated Delivery Time', 'Driver Management', 'Third-party Integrations (Uber, Talabat)', 'Online Order Toggle']}
    />
  )
}
