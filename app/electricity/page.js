import ElectricityForm from '@/components/electricity/ElectricityForm';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Additional Electricity Order Form — Pico',
    description: 'Order additional electricity for your booth from Pico International (Bahrain).',
};

/** Vendor link: /electricity (?edit=<orderKey> changes an existing order). */
export default function ElectricityPage({ searchParams }) {
    return <ElectricityForm editKey={String(searchParams?.edit || '').slice(0, 40)} />;
}
