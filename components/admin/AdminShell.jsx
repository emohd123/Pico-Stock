'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ADMIN_NAV_ITEMS = [
    { key: 'overview', href: '/admin?tab=overview', label: 'Overview' },
    { key: 'products', href: '/admin?tab=products', label: 'Products' },
    { key: 'orders', href: '/admin?tab=orders', label: 'Orders' },
    { key: 'upload', href: '/admin?tab=upload', label: 'Upload & Import' },
    { key: 'designers', href: '/admin/designers', label: 'Designers Board' },
    { key: 'stand-design', href: '/admin/stand-design', label: 'Stand Design' },
    { key: 'pico-ai', href: '/admin/pico-ai', label: '✦ Pico AI' },
    { key: 'traditional-ai', href: '/admin/pico-ai/traditional-ai-cloth-change', label: '　Traditional AI Cloth Change' },
    { key: 'landmark-qr', href: '/admin/pico-ai/landmark-qr-reports', label: '　Landmark QR Reports' },
    { key: 'name-art', href: '/admin/pico-ai/name-art', label: '　Name Art Experience' },
    { key: 'concours-3d', href: '/admin/pico-ai/royal-bahrain-concours-2026', label: '　Concours 3D Studio' },
    { key: 'grid-measure', href: '/admin/grid-measure', label: 'Grid Measure' },
    { key: 'royal-bahrain-concours-2026', href: '/admin/royal-bahrain-concours-2026', label: 'ROYAL BAHRAIN CONCOURS 2026' },
    { key: 'quotations', href: '/admin/quotations', label: 'Quotation Studio' },
    { key: 'ministry', href: '/quotations', label: 'Ministry Quotations' },
];

function itemClassName(active) {
    return `admin-sidebar-item${active ? ' active' : ''}`;
}

export default function AdminShell({ activeSection, children, contentClassName = 'admin-content' }) {
    const router = useRouter();

    async function handleLogout() {
        try {
            await fetch('/api/admin/logout', { method: 'POST' });
        } catch {}
        router.push('/admin/login');
        router.refresh();
    }

    return (
        <div className="page-enter">
            <div className="admin-layout">
                <aside className="admin-sidebar">
                    {ADMIN_NAV_ITEMS.map((item) => (
                        <Link
                            key={item.key}
                            href={item.href}
                            className={itemClassName(activeSection === item.key)}
                            style={{ display: 'block', textDecoration: 'none' }}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <button type="button" className="admin-sidebar-item" onClick={handleLogout}>
                        Logout
                    </button>
                </aside>

                <div className={contentClassName}>
                    {children}
                </div>
            </div>
        </div>
    );
}
