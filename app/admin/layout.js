import ChatBubble from '@/components/brain/ChatBubble';

/**
 * Admin layout — wraps all /admin/* pages.
 * Injects the global Pico Brain chat bubble on every admin page.
 */
export default function AdminLayout({ children }) {
    return (
        <>
            {children}
            <ChatBubble />
        </>
    );
}
