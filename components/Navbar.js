'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cartContext';
import { DEFAULT_BRANDING_LOGO, FALLBACK_BRANDING_LOGO } from '@/lib/quotationCommercial';

export default function Navbar() {
    const { cartCount } = useCart();
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);
    const [logoSrc, setLogoSrc] = useState(DEFAULT_BRANDING_LOGO);

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) setMenuOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <img
                        src={logoSrc}
                        alt="Pico Stock"
                        className="navbar-logo"
                        width={176}
                        height={48}
                        onError={() => {
                            setLogoSrc((current) => (
                                current === DEFAULT_BRANDING_LOGO ? FALLBACK_BRANDING_LOGO : current
                            ));
                        }}
                    />
                </Link>

                <ul className={`navbar-links ${menuOpen ? 'open' : ''}`}>
                    <li><Link href="/" className={pathname === '/' ? 'active' : ''}>Home</Link></li>
                    <li><Link href="/company-profile" className={isActive('/company-profile') ? 'active' : ''}>Company Profile</Link></li>
                    <li><Link href="/catalogue" className={isActive('/catalogue') ? 'active' : ''}>Catalogue</Link></li>
                    <li><Link href="/admin/login" className={isActive('/admin') ? 'active' : ''}>Admin</Link></li>
                </ul>

                <div className="navbar-actions">
                    <Link href="/cart" className="cart-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                        </svg>
                        <span className="cart-btn-label">Cart</span>
                        {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                    </Link>
                    <button
                        className="mobile-menu-btn"
                        type="button"
                        onClick={() => setMenuOpen(prev => !prev)}
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                            </svg>
                        )}
                    </button>
                </div>
            </nav>

            {menuOpen && (
                <button
                    type="button"
                    className="navbar-backdrop"
                    aria-label="Close navigation menu"
                    onClick={() => setMenuOpen(false)}
                />
            )}
        </>
    );
}
