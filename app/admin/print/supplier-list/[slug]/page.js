import SupplierListPrint from '@/components/events/SupplierListPrint';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Supplier requirement list — Pico Admin',
    robots: { index: false, follow: false },
};

/** Printable supplier list: /admin/print/supplier-list/<event>?supplier=warehouse&scope=confirmed (admin only). */
export default function SupplierListPrintPage({ params, searchParams }) {
    const scope = searchParams?.scope === 'active' ? 'active' : 'confirmed';
    return <SupplierListPrint slug={params.slug} supplier={String(searchParams?.supplier || '')} scope={scope} />;
}
