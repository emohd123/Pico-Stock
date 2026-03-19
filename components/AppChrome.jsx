import Navbar from '@/components/Navbar';

export default function AppChrome({ children }) {
    return (
        <>
            <Navbar />
            <main style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </main>
            <footer className="footer">
                <p>© {new Date().getFullYear()} Pico Exhibition Services - Bahrain. All rights reserved.</p>
                <p style={{ marginTop: '0.4rem' }}>
                    Pico International (Bahrain) &nbsp;|&nbsp;{' '}
                    <a href="https://pico.com/en" target="_blank" rel="noopener noreferrer">pico.com/en</a>
                </p>
                <p style={{ marginTop: '0.4rem' }}>
                    Tel: <a href="tel:+97336357377">+973 3635 7377</a>
                    &nbsp;|&nbsp; Fax: +973 1311 6090
                    &nbsp;|&nbsp; Email: <a href="mailto:info@picobahrain.com">info@picobahrain.com</a>
                </p>
                <p style={{ marginTop: '0.4rem' }}>
                    Facebook: <a href="https://facebook.com/PicoBahrain" target="_blank" rel="noopener noreferrer">facebook.com/PicoBahrain</a>
                    &nbsp;|&nbsp; Instagram: <a href="https://instagram.com/picobahrain" target="_blank" rel="noopener noreferrer">instagram.com/picobahrain</a>
                </p>
            </footer>
        </>
    );
}
