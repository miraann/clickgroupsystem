import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { Star } from 'lucide-react'
export default function MemberPage() {
  return (
    <SettingsPlaceholder
      icon={Star}
      title="Member"
      description="Loyalty programs, membership tiers, points system, and member-exclusive discounts."
      color="amber"
      comingSoon={['Loyalty Points System', 'Membership Tiers', 'Points Earn Rate', 'Points Redeem Rate', 'Member Discounts', 'Birthday Rewards', 'Member Card / QR', 'Enrollment Flow']}
    />
  )
}
