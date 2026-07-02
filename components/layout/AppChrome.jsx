'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';

export default function AppChrome({ children }) {
    const pathname = usePathname();
    // Ministry quotation links (/q/[token]) are sent to external recipients —
    // render them bare, without the site navbar/footer.
    if (pathname && pathname.startsWith('/q/')) {
        return <main style={{ position: 'relative', zIndex: 1 }}>{children}</main>;
    }
    return (
        <>
            <Navbar />
            <main style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </main>
            <footer className="footer">
                <div className="footer-inner">
                    <div className="footer-brand">
                        {/* Logo per brand guideline: full opacity (never alter glyph opacity),
                            clear space around the mark, official file, no recolor. */}
                        <img
                            src="/branding/pico-logo.png"
                            alt="Pico"
                            style={{ height: '40px', width: 'auto', opacity: 1, display: 'block', alignSelf: 'flex-start', padding: '4px 0' }}
                        />
                        <span className="footer-brand-tagline">Total Brand Activation</span>
                        <p className="footer-tagline">Exhibition Booth Extras — Rental &amp; Services</p>
                    </div>

                    <div className="footer-links">
                        <div className="footer-col">
                            <h4 className="footer-col-heading">Contact</h4>
                            <p><a href="tel:+97336357377">+973 3635 7377</a></p>
                            <p>Fax: +973 1311 6090</p>
                            <p><a href="mailto:info@picobahrain.com">info@picobahrain.com</a></p>
                        </div>
                        <div className="footer-col">
                            <h4 className="footer-col-heading">Company</h4>
                            <p><a href="https://pico.com/en" target="_blank" rel="noopener noreferrer">pico.com/en</a></p>
                            <p><a href="https://facebook.com/PicoBahrain" target="_blank" rel="noopener noreferrer">Facebook</a></p>
                            <p><a href="https://instagram.com/picobahrain" target="_blank" rel="noopener noreferrer">Instagram</a></p>
                        </div>
                    </div>
                </div>

                <div className="footer-bottom">
                    <span className="footer-signature">Where there&rsquo;s an audience, there&rsquo;s a mission for Total Brand Activation.</span>
                    <span>&copy; {new Date().getFullYear()} Pico International (Bahrain). All rights reserved.</span>
                </div>
            </footer>
        </>
    );
}
