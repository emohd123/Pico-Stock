'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cartContext';

export default function Navbar() {
    const { cartCount } = useCart();
    const pathname = usePathname();
    const [menuOpen, setMenuOpen] = useState(false);

    const isActive = (path) => pathname === path || pathname.startsWith(path + '/');

    useEffect(() => {
        setMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setMenuOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <>
            <nav className="navbar">
                <Link href="/" className="navbar-brand">
                    <svg className="navbar-logo" viewBox="0 0 260 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="30" cy="30" r="28" stroke="#00A5A5" strokeWidth="2" fill="none" />
                        <path d="M30 12 C25 15, 15 20, 15 30 C15 40, 22 48, 30 48 C38 48, 45 40, 45 30 C45 20, 35 15, 30 12Z" fill="#00A5A5" opacity="0.3" />
                        <path d="M30 8 L30 18 M25 14 L30 18 L35 14" stroke="#00A5A5" strokeWidth="1.5" fill="none" />
                        <path d="M20 22 C22 20, 28 16, 30 18 C32 16, 38 20, 40 22" stroke="#00A5A5" strokeWidth="1.5" fill="none" />
                        <path d="M16 28 C18 25, 26 20, 30 22 C34 20, 42 25, 44 28" stroke="#00A5A5" strokeWidth="1.5" fill="none" />
                        <path d="M14 34 C16 30, 24 24, 30 26 C36 24, 44 30, 46 34" stroke="#00A5A5" strokeWidth="1.5" fill="none" />
                        <path d="M18 40 C20 36, 26 30, 30 32 C34 30, 40 36, 42 40" stroke="#00A5A5" strokeWidth="1.5" fill="none" />
                        <rect x="29" y="32" width="2" height="16" fill="#00A5A5" opacity="0.6" />
                        <text x="68" y="28" fontFamily="Inter, Arial, sans-serif" fontSize="17" fontWeight="700" fill="#9CA3AF" letterSpacing="-0.3">Pico International</text>
                        <text x="68" y="47" fontFamily="Inter, Arial, sans-serif" fontSize="14" fontWeight="400" fill="#9CA3AF" letterSpacing="0.5">Bahrain</text>
                    </svg>
                    <span className="navbar-title">
                        <span>Stock</span>
                    </span>
                </Link>

                <ul className={`navbar-links ${menuOpen ? 'open' : ''}`}>
                    <li><Link href="/" className={isActive('/') && pathname === '/' ? 'active' : ''}>Home</Link></li>
                    <li><Link href="/company-profile" className={isActive('/company-profile') ? 'active' : ''}>Company Profile</Link></li>
                    <li><Link href="/catalogue" className={isActive('/catalogue') ? 'active' : ''}>Catalogue</Link></li>
                    <li><Link href="/admin/login" className={isActive('/admin') ? 'active' : ''}>Admin</Link></li>
                </ul>

                <div className="navbar-actions">
                    <Link href="/cart" className="cart-btn">
                        <span className="cart-btn-icon">Cart</span>
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
                        {menuOpen ? 'X' : 'Menu'}
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
