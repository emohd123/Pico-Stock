'use client';

// Admin-only: delete a single quotation (with its line items + PDF). Confirms first.
export default function DeleteQuoteButton({ ministryId, quoteId, quoteRef, action }) {
    return (
        <form action={action} onSubmit={(e) => { if (!confirm(`Delete quotation ${quoteRef}? This removes it and its PDF permanently.`)) e.preventDefault(); }}>
            <input type="hidden" name="ministryId" value={ministryId} />
            <input type="hidden" name="quoteId" value={quoteId} />
            <button type="submit" title="Delete this quotation"
                style={{ borderRadius: 4, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', padding: '4px 8px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                Delete
            </button>
        </form>
    );
}
