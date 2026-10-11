import FindOrder from '@/components/events/FindOrder';

export const metadata = {
    title: 'Find your order — Pico',
    robots: { index: false, follow: false },
};

/** /order — look up an order by its number plus the email or phone used on it. */
export default function FindOrderPage() {
    return <FindOrder />;
}
