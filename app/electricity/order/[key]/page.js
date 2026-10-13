import ElectricityOrderView from '@/components/electricity/ElectricityOrderView';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Your electricity order — Pico',
    robots: { index: false, follow: false },
};

/** The vendor's private order page: /electricity/order/<orderKey>. */
export default function ElectricityOrderPage({ params, searchParams }) {
    return <ElectricityOrderView orderKey={params.key} updated={searchParams?.updated === '1'} />;
}
