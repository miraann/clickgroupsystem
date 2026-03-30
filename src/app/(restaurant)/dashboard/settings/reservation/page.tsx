import { SettingsPlaceholder } from '@/components/ui/settings-placeholder'
import { CalendarDays } from 'lucide-react'
export default function ReservationPage() {
  return (
    <SettingsPlaceholder
      icon={CalendarDays}
      title="Reservation"
      description="Online booking, reservation slots, party sizes, confirmation messages, and waitlist."
      color="indigo"
      comingSoon={['Online Booking Toggle', 'Reservation Slots', 'Max Party Size', 'Hold Duration', 'Confirmation SMS / Email', 'Waitlist Management', 'Deposit Requirements']}
    />
  )
}
