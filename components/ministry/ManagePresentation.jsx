'use client';
import { useState } from 'react';
import PresentationControls from './PresentationControls';
import PdfModal from './PdfModal';

// Wraps the presentation Generate/Regenerate/View controls with a PDF popup,
// for use on the ministry Manage page.
export default function ManagePresentation({ ministry }) {
    const [modal, setModal] = useState(null);
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            {ministry.quoteViewUrl
                ? <PresentationControls ministry={ministry} onView={(url, title) => setModal({ url, title })} />
                : <span style={{ fontSize: 13, color: '#94a3b8' }}>Generate a quotation first to build a presentation.</span>}
            {modal ? <PdfModal url={modal.url} title={modal.title} onClose={() => setModal(null)} /> : null}
        </div>
    );
}
