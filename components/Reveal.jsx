'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/**
 * Reveal — fade + rise a block into view on scroll.
 *
 * Robust by design: uses IntersectionObserver, but a fallback timer guarantees
 * the content becomes visible even if the observer never fires (SSR/hydration
 * edge cases, unusual scroll containers). Content can therefore NEVER stay
 * permanently hidden — the worst case is it simply fades in after ~1.4s.
 */
export default function Reveal({ children, delay = 0, y = 24, className }) {
    const ref = useRef(null);
    const [shown, setShown] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Safety net: reveal regardless after a short delay.
        const fallback = setTimeout(() => setShown(true), 1400);

        if (typeof IntersectionObserver === 'undefined') {
            setShown(true);
            clearTimeout(fallback);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setShown(true);
                    io.disconnect();
                    clearTimeout(fallback);
                }
            },
            { rootMargin: '0px 0px -80px 0px' }
        );
        io.observe(el);

        return () => {
            io.disconnect();
            clearTimeout(fallback);
        };
    }, []);

    return (
        <motion.div
            ref={ref}
            className={className}
            initial={false}
            animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y }}
            transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
        >
            {children}
        </motion.div>
    );
}
