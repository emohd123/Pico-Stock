'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ADMIN_NAV_ITEMS = [
    { key: 'overview', href: '/admin?tab=overview', label: 'Overview' },
    { key: 'products', href: '/admin?tab=products', label: 'Products' },
    { key: 'orders', href: '/admin?tab=orders', label: 'Orders' },
    { key: 'upload', href: '/admin?tab=upload', label: 'Upload & Import' },
    { key: 'designers', href: '/admin/designers', label: 'Designers Board' },
    { key: 'quotations', href: '/admin/quotations', label: 'Quotation Studio' },
];

function itemClassName(active) {
    return `admin-sidebar-item${active ? ' active' : ''}`;
}

export default function AdminShell({ activeSection, children, contentClassName = 'admin-content' }) {
    const router = useRouter();

    function handleLogout() {
        sessionStorage.removeItem('pico-admin');
        router.push('/admin/login');
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
