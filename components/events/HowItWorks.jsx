'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const STEPS = [
    { image: '/how-it-works/1-order.webp', title: 'Choose & order', text: 'Pick your items and place your order. You receive an order number by email.' },
    { image: '/how-it-works/2-confirm.webp', title: 'We confirm', text: 'We check availability and email you the payment details (our bank account).' },
    { image: '/how-it-works/3-pay.webp', title: 'Pay & send the receipt', text: 'Pay by bank transfer, then reply to our email with the receipt or upload it on your order page.' },
    { image: '/how-it-works/4-locked.webp', title: 'Items locked', text: 'Once your payment is received, your items are locked and you get the order confirmation.' },
    { image: '/how-it-works/5-check.webp', title: 'Check or change', text: 'Use your order number under "My order" to check your order any time, or change it before we confirm.' },
];

/** "?" button that opens a short, picture-led explanation of the ordering steps. */
export default function HowItWorks({ className = '' }) {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open]);

    return (
        <>
            <button type="button" className={`hiw-btn ${className}`} onClick={() => setOpen(true)} aria-label="How ordering works" title="How ordering works">?</button>
            {/* Rendered on <body>: the sticky top bar's backdrop blur would otherwise trap a fixed overlay inside it. */}
            {open && createPortal(
                <div className="evm-modal-overlay" onClick={() => setOpen(false)}>
                    <div className="evm-modal hiw-modal" role="dialog" aria-modal="true" aria-label="How ordering works" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="evm-modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                        <div className="hiw-body">
                            <h2>How it works</h2>
                            <ol className="hiw-steps">
                                {STEPS.map((step, index) => (
                                    <li key={step.title}>
                                        <img src={step.image} alt="" loading="lazy" />
                                        <div>
                                            <span className="hiw-num">{index + 1}</span>
                                            <strong>{step.title}</strong>
                                            <p>{step.text}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                            <button type="button" className="evm-cta" onClick={() => setOpen(false)}>Got it</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
