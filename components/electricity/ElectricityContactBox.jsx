/** "Important note" box next to the vendor form: a short note plus one Pico contact. */
export default function ElectricityContactBox({ form, className = '' }) {
    const phone = String(form.contactPhone || '').trim();
    const email = String(form.receiptEmail || '').trim();
    const note = String(form.sideNote || '').trim();
    if (!note && !phone && !email) return null;

    return (
        <aside className={`elx-side ${className}`} aria-label="Important note">
            <div className="elx-side-head"><span aria-hidden="true">⚠️</span>Important note</div>
            {note && <p className="elx-side-note">{note}</p>}
            {(phone || email) && (
                <div className="elx-side-contact">
                    <span className="elx-side-label">Contact{form.contactName ? '' : ' Pico'}</span>
                    {form.contactName && <strong>{form.contactName}</strong>}
                    {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}><span aria-hidden="true">📞</span>{phone}</a>}
                    {email && <a href={`mailto:${email}`}><span aria-hidden="true">✉️</span>{email}</a>}
                </div>
            )}
        </aside>
    );
}
