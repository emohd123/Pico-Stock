'use client';

// Wraps the delete-ministry server action with a browser confirm so a whole
// ministry (with its quotations, photos and notes) can't be wiped by accident.
export default function DeleteMinistryButton({ ministryId, ministryName, action }) {
    return (
        <form
            action={action}
            onSubmit={(e) => {
                if (!confirm(`Delete "${ministryName}" and all its quotations, photos and notes? This cannot be undone.`)) {
                    e.preventDefault();
                }
            }}
        >
            <input type="hidden" name="ministryId" value={ministryId} />
            <button
                type="submit"
                title="Delete this ministry"
                style={{ borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', padding: '4px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
                Delete
            </button>
        </form>
    );
}
