import AdminShell from '@/components/admin/AdminShell';
import EventStudio from '@/components/event-studio/EventStudio';
import '@/components/event-studio/event-studio.css';

export const metadata = { title: 'Royal Bahrain Concours — 3D Event Studio | Pico AI' };

export default function Page() {
  return <AdminShell activeSection="concours-3d" contentClassName="admin-content-flush"><EventStudio /></AdminShell>;
}
