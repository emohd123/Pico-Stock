import Navbar from '@/components/Navbar';
import Image from 'next/image';

export default function AppChrome({ children }) {
    return (
        <>
            <Navbar />
            <main style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </main>
            <footer className="footer">
                <div className="footer-inner">
                    <div className="footer-brand">
                        <Image
                            src="/branding/pico-logo.png"
                            alt="Pico Stock"
                            width={140}
                            height={38}
                            style={{ opacity: 0.7 }}
                        />
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
                    <span>© {new Date().getFullYear()} Pico International (Bahrain). All rights reserved.</span>
                </div>
            </footer>
        </>
    );
}
