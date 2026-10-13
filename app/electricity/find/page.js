import ElectricityFindOrder from '@/components/electricity/ElectricityFindOrder';

export const metadata = {
    title: 'Find your electricity order — Pico',
    robots: { index: false, follow: false },
};

export default function FindElectricityOrderPage() {
    return <ElectricityFindOrder />;
}
