import ExhibitorOrder from '@/components/events/ExhibitorOrder';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Your order — Pico',
    robots: { index: false, follow: false },
};

/** The exhibitor's private order page: /o/<orderKey>. */
export default function OrderPage({ params }) {
    return <ExhibitorOrder orderKey={params.key} />;
}
