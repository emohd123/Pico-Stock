import './globals.css';
import AppChrome from '@/components/AppChrome';
import { CartProvider } from '@/lib/cartContext';

export const metadata = {
    title: 'Pico Stock - Exhibition Booth Extras Rental',
    description: 'Order furniture, TV/LED screens, and graphics for your exhibition booth. Premium rental catalogue by Pico Exhibition Services, Bahrain.',
    keywords: 'exhibition, booth, rental, furniture, TV, LED, graphics, Bahrain, Pico',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                <CartProvider>
                    <AppChrome>{children}</AppChrome>
                </CartProvider>
            </body>
        </html>
    );
}
