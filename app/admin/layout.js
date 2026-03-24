'use client';

import { usePathname } from 'next/navigation';
import AdminShell from '@/components/admin/AdminShell';

function getAdminSection(pathname) {
    if (pathname.startsWith('/admin/designers')) return 'designers';
    if (pathname.startsWith('/admin/quotations')) return 'quotations';
    return '';
}

export default function AdminLayout({ children }) {
    const pathname = usePathname() || '';
    const activeSection = getAdminSection(pathname);

    if (!activeSection) {
        return <>{children}</>;
    }

    return (
        <AdminShell activeSection={activeSection} contentClassName="admin-content">
            {children}
        </AdminShell>
    );
}
