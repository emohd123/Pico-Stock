'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/eventMarketplacePricing';
import '@/components/events/event-marketplace.css';
import './electricity.css';

const PAY_LABEL = {
    review: 'Needs review',
    awaiting: 'Awaiting payment',
    submitted: 'Receipt uploaded',
    verified: 'Paid',
    rejected: 'Receipt not OK',
};

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'review', label: 'Needs review' },
    { key: 'awaiting', label: 'Awaiting payment' },
    { key: 'submitted', label: 'Receipts to check' },
    { key: 'verified', label: 'Paid' },
    { key: 'declined', label: 'Declined' },
];

const VENDOR_ROWS = [
    ['restaurant', 'Restaurant'], ['booth', 'Booth / unit'], ['contactPerson', 'Contact'],
    ['mobile', 'Mobile'], ['tel', 'Tel'], ['email', 'Email'], ['crNo', 'C.R. No.'],
];

function stageOf(order) {
    if (order.status === 'declined') return 'declined';
    return order.payment?.status || 'review';
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function OrderCard({ order, busy, onAction, onSaveNotes, onDelete }) {
    const [open, setOpen] = useState(false);
    const [notes, setNotes] = useState(order.adminNotes || '');
    useEffect(() => { setNotes(order.adminNotes || ''); }, [order.adminNotes]);
    const stage = stageOf(order);
    const v = order.vendor || {};
    const pay = order.payment || {};

    return (
        <div className="eva-request">
            <div className="eva-request-head" onClick={() => setOpen((value) => !value)}>
                <span className="eva-request-ref">{order.reference}</span>
                <div>
                    <div className="eva-request-company">{v.company}{v.restaurant && v.restaurant !== v.company ? ` · ${v.restaurant}` : ''}</div>
                    <div className="eva-request-meta">{v.contactPerson} · {v.mobile} · {formatDate(order.createdAt)}</div>
                </div>
                <span className={stage === 'declined' ? 'eva-status declined' : `eva-pay ${pay.status}`}>{stage === 'declined' ? 'Declined' : PAY_LABEL[pay.status]}</span>
                <div className="eva-request-total">{formatMoney(order.total, order.currency)}<small>{order.items.reduce((n, item) => n + item.quantity, 0)} item(s)</small></div>
            </div>
            {open && (
                <div className="eva-request-body">
                    <div>
                        <h4>Order</h4>
                        <div className="orv-lines">
                            {order.items.map((item) => (
                                <div key={item.id} className="exo-line">
                                    <span>{item.name}</span>
                                    <span>{item.quantity} × {formatMoney(item.price, order.currency)}</span>
                                    <strong>{formatMoney(item.lineTotal, order.currency)}</strong>
                                </div>
                            ))}
                        </div>
                        {v.notes && <p className="eva-request-notes"><strong>Other requirements:</strong> {v.notes}</p>}
                        <p className="eva-request-notes"><strong>Equipment list:</strong> {order.equipment?.name || 'not uploaded'}</p>

                        <div className="eva-request-tools">
                            {stage === 'review' && (
                                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(order, 'approve')}>Approve &amp; send payment details</button>
                            )}
                            {['awaiting', 'submitted', 'rejected'].includes(stage) && (
                                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(order, 'verify')}>Verify payment &amp; confirm</button>
                            )}
                            {order.equipment?.path && (
                                <a className="btn btn-secondary btn-sm" href={`/api/electricity/orders/${encodeURIComponent(order.id)}/equipment`} target="_blank" rel="noreferrer">Equipment list</a>
                            )}
                            {pay.proofPath && (
                                <a className="btn btn-secondary btn-sm" href={`/api/electricity/orders/${encodeURIComponent(order.id)}/payment`} target="_blank" rel="noreferrer">Open receipt</a>
                            )}
                            {['awaiting', 'submitted'].includes(stage) && (
                                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(order, 'reject', true)}>Receipt not OK</button>
                            )}
                            {!['declined', 'verified'].includes(stage) && (
                                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(order, 'decline', true)}>Decline</button>
                            )}
                            {stage === 'declined' && (
                                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction(order, 'reopen')}>Reopen</button>
                            )}
                            <a className="btn btn-secondary btn-sm" href={`/electricity/order/${order.orderKey}`} target="_blank" rel="noreferrer">Vendor&apos;s page</a>
                        </div>
                        {stage === 'awaiting' && <p className="eva-hint elx-admin-hint">Receipt came by email? Click Verify payment &amp; confirm once the money is in the account.</p>}
                    </div>
                    <div>
                        <h4>Vendor</h4>
                        <div className="eva-kv">
                            <span>Company</span><strong>{v.company}</strong>
                            {VENDOR_ROWS.filter(([key]) => v[key]).map(([key, label]) => (
                                <FragmentRow key={key} label={label} value={v[key]} rtl={false} />
                            ))}
                        </div>
                        <h4 style={{ marginTop: '1rem' }}>Notes &amp; history</h4>
                        <textarea className="form-textarea" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
                        <div className="eva-request-tools">
                            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || notes === (order.adminNotes || '')} onClick={() => onSaveNotes(order, notes)}>Save notes</button>
                            <span className="spacer" style={{ flex: 1 }} />
                            <button type="button" className="btn btn-secondary btn-sm elx-danger" disabled={busy} onClick={() => onDelete(order)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FragmentRow({ label, value, rtl }) {
    return (<><span>{label}</span><strong dir={rtl ? 'rtl' : undefined}>{value}</strong></>);
}

function FormSetup({ form, onSave, saving }) {
    const [draft, setDraft] = useState(form);
    useEffect(() => { setDraft(form); }, [form]);
    const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
    const setItem = (index, key, value) => setDraft((current) => ({
        ...current,
        items: current.items.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    }));
    const dirty = JSON.stringify(draft) !== JSON.stringify(form);

    return (
        <form className="elx-admin-setup" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
            <section className="eva-card">
                <h3>Event &amp; status</h3>
                <div className="eva-grid-2">
                    <label className="eva-field">
                        <span>Status</span>
                        <select className="form-select" value={draft.status} onChange={(e) => set('status', e.target.value)}>
                            <option value="draft">Draft: vendors can&apos;t submit yet</option>
                            <option value="open">Open: vendors can order</option>
                            <option value="closed">Closed: no new orders</option>
                        </select>
                    </label>
                    <label className="eva-field">
                        <span>Form title</span>
                        <input className="form-input" value={draft.title} onChange={(e) => set('title', e.target.value)} />
                    </label>
                    <label className="eva-field">
                        <span>Event name</span>
                        <input className="form-input" value={draft.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="e.g. Bahrain Food Festival 2027" />
                    </label>
                    <label className="eva-field">
                        <span>Event dates</span>
                        <input className="form-input" value={draft.eventDates} onChange={(e) => set('eventDates', e.target.value)} placeholder="e.g. 07 – 26 February 2027" />
                    </label>
                    <label className="eva-field">
                        <span>Venue</span>
                        <input className="form-input" value={draft.venue} onChange={(e) => set('venue', e.target.value)} />
                    </label>
                    <label className="eva-field">
                        <span>Submit form by</span>
                        <input className="form-input" type="date" value={draft.submitBy} onChange={(e) => set('submitBy', e.target.value)} />
                    </label>
                    <label className="eva-field">
                        <span>Order number prefix</span>
                        <input className="form-input" value={draft.referencePrefix} onChange={(e) => set('referencePrefix', e.target.value)} />
                        <small>Orders look like {(draft.referencePrefix || 'ELEC').toUpperCase()}-261013-AB12</small>
                    </label>
                    <label className="eva-field">
                        <span>Contact phone</span>
                        <input className="form-input" value={draft.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
                    </label>
                    <label className="eva-field eva-span-2">
                        <span>Note above the power options</span>
                        <textarea className="form-textarea" rows={3} value={draft.intro} onChange={(e) => set('intro', e.target.value)} />
                    </label>
                </div>
            </section>

            <section className="eva-card">
                <h3>Power options &amp; prices (VAT inclusive)</h3>
                <div className="eva-table-wrap">
                    <table className="eva-table">
                        <thead><tr><th>Show</th><th>Description</th><th className="num">Unit cost (BHD)</th><th /></tr></thead>
                        <tbody>
                            {draft.items.map((item, index) => (
                                <tr key={item.id} className={item.visible ? '' : 'hidden-row'}>
                                    <td><input type="checkbox" checked={item.visible} onChange={(e) => setItem(index, 'visible', e.target.checked)} aria-label="Show to vendors" /></td>
                                    <td><input type="text" value={item.name} onChange={(e) => setItem(index, 'name', e.target.value)} /></td>
                                    <td className="num"><input type="number" min="0" step="0.001" value={item.price} onChange={(e) => setItem(index, 'price', e.target.value)} /></td>
                                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => set('items', draft.items.filter((_, i) => i !== index))}>Remove</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="eva-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('items', [...draft.items, { id: `item-${Date.now().toString(36)}`, name: '', price: 0, visible: true }])}>+ Add option</button>
                    <span className="eva-hint">Untick to hide an option from vendors.</span>
                </div>
            </section>

            <section className="eva-card">
                <h3>Terms &amp; emails</h3>
                <div className="eva-grid-2">
                    <label className="eva-field eva-span-2">
                        <span>Terms &amp; conditions (one per line)</span>
                        <textarea className="form-textarea" rows={6} value={draft.terms} onChange={(e) => set('terms', e.target.value)} />
                    </label>
                    <label className="eva-field">
                        <span>Send new orders to</span>
                        <input className="form-input" value={draft.notifyTo} onChange={(e) => set('notifyTo', e.target.value)} />
                        <small>Vendors also reply to this address with their transfer receipt.</small>
                    </label>
                    <label className="eva-field">
                        <span>CC</span>
                        <input className="form-input" value={draft.notifyCc} onChange={(e) => set('notifyCc', e.target.value)} />
                    </label>
                </div>
            </section>

            <div className="eva-actions">
                <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save form'}</button>
                {dirty && <button type="button" className="btn btn-secondary" onClick={() => setDraft(form)}>Discard changes</button>}
            </div>
        </form>
    );
}

export default function ElectricityAdmin() {
    const [tab, setTab] = useState('orders');
    const [form, setForm] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [flash, setFlash] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState('');

    const load = useCallback(async () => {
        try {
            const [formRes, ordersRes] = await Promise.all([
                fetch('/api/electricity/admin', { cache: 'no-store' }),
                fetch('/api/electricity/orders', { cache: 'no-store' }),
            ]);
            const formJson = await formRes.json();
            const ordersJson = await ordersRes.json();
            if (!formRes.ok) throw new Error(formJson?.error || 'Failed to load the form');
            if (!ordersRes.ok) throw new Error(ordersJson?.error || 'Failed to load orders');
            setForm(formJson.form);
            setOrders(ordersJson);
        } catch (error) {
            setFlash({ type: 'err', text: error.message });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { setOrigin(window.location.origin); load(); }, [load]);

    function replaceOrder(updated) {
        setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)));
    }

    async function action(order, name, askReason = false) {
        let note = '';
        if (askReason) {
            const reply = window.prompt(name === 'decline' ? 'Reason for declining (sent to the vendor, optional):' : 'What is wrong with the receipt? (sent to the vendor, optional)');
            if (reply === null) return;
            note = reply;
        } else if (name === 'verify' && !window.confirm(`Confirm that ${formatMoney(order.total, order.currency)} for ${order.reference} reached the bank account? The vendor gets the confirmation email.`)) {
            return;
        } else if (name === 'approve' && !window.confirm(`Approve ${order.reference} and email the bank details to ${order.vendor.email}?`)) {
            return;
        }
        setBusy(true);
        setFlash(null);
        try {
            const response = await fetch(`/api/electricity/orders/${encodeURIComponent(order.id)}/payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: name, note }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Failed');
            replaceOrder(json.order);
            const done = { approve: 'Approved, payment details emailed to the vendor.', verify: 'Payment verified, confirmation emailed.', reject: 'Vendor asked to send the receipt again.', decline: 'Order declined, vendor emailed.', reopen: 'Order reopened.' };
            setFlash(json.warning ? { type: 'warn', text: json.warning } : { type: 'ok', text: `${order.reference}: ${done[name]}` });
        } catch (error) {
            setFlash({ type: 'err', text: error.message });
        } finally {
            setBusy(false);
        }
    }

    async function saveNotes(order, adminNotes) {
        setBusy(true);
        try {
            const response = await fetch(`/api/electricity/orders/${encodeURIComponent(order.id)}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminNotes }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Failed');
            replaceOrder(json.order);
            setFlash({ type: 'ok', text: 'Notes saved.' });
        } catch (error) {
            setFlash({ type: 'err', text: error.message });
        } finally {
            setBusy(false);
        }
    }

    async function remove(order) {
        if (!window.confirm(`Delete order ${order.reference} from ${order.vendor.company}? This cannot be undone.`)) return;
        setBusy(true);
        try {
            const response = await fetch(`/api/electricity/orders/${encodeURIComponent(order.id)}`, { method: 'DELETE' });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Failed');
            setOrders((current) => current.filter((item) => item.id !== order.id));
            setFlash({ type: 'ok', text: `${order.reference} deleted.` });
        } catch (error) {
            setFlash({ type: 'err', text: error.message });
        } finally {
            setBusy(false);
        }
    }

    async function saveForm(draft) {
        setBusy(true);
        setFlash(null);
        try {
            const response = await fetch('/api/electricity/admin', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: draft }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json?.error || 'Failed to save');
            setForm(json.form);
            setFlash({ type: 'ok', text: 'Form saved.' });
        } catch (error) {
            setFlash({ type: 'err', text: error.message });
        } finally {
            setBusy(false);
        }
    }

    const counts = useMemo(() => {
        const result = { all: orders.length };
        for (const order of orders) {
            const stage = stageOf(order);
            const key = stage === 'rejected' ? 'awaiting' : stage;
            result[key] = (result[key] || 0) + 1;
        }
        return result;
    }, [orders]);

    const paidTotal = orders.filter((order) => stageOf(order) === 'verified').reduce((sum, order) => sum + order.total, 0);

    const visible = orders.filter((order) => {
        const stage = stageOf(order);
        if (filter !== 'all' && (stage === 'rejected' ? 'awaiting' : stage) !== filter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const v = order.vendor || {};
        return [order.reference, v.company, v.restaurant, v.contactPerson, v.email, v.mobile, v.booth]
            .some((value) => String(value || '').toLowerCase().includes(q));
    });

    if (loading) return <div className="loading-page"><div className="spinner" /></div>;
    if (!form) return <div className="eva-flash err">{flash?.text || 'Failed to load.'}</div>;

    const vendorLink = `${origin}/electricity`;

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(vendorLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {}
    }

    return (
        <div className="eva-page elx-admin">
            <div className="elx-admin-head">
                <div>
                    <h1>Additional Electricity Orders</h1>
                    <p className="eva-hint">
                        Form B{form.eventName ? ` · ${form.eventName}` : ''}{' '}
                        <span className={`eva-status ${form.status}`}>{form.status}</span>
                    </p>
                </div>
                <div className="eva-link-box">
                    <span>Vendor link</span>
                    <code>{vendorLink}</code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
                    <a className="btn btn-primary btn-sm" href="/electricity" target="_blank" rel="noreferrer">Open form</a>
                </div>
            </div>

            {form.status !== 'open' && (
                <div className="eva-flash warn">The form is <strong>{form.status}</strong>: vendors can see it but cannot send orders. Set the status to Open in Form setup when you are ready to share the link.</div>
            )}
            {flash && <div className={`eva-flash ${flash.type}`}>{flash.text}</div>}

            <div className="eva-tabs">
                <button type="button" className={`eva-tab${tab === 'orders' ? ' active' : ''}`} onClick={() => setTab('orders')}>
                    Orders <span className="eva-pill">{orders.length}{counts.review ? ` · ${counts.review} new` : ''}</span>
                </button>
                <button type="button" className={`eva-tab${tab === 'setup' ? ' active' : ''}`} onClick={() => setTab('setup')}>Form setup</button>
            </div>

            {tab === 'orders' ? (
                <div>
                    <div className="eva-summary-strip">
                        <div className="eva-stat"><span>Needs review</span><strong>{counts.review || 0}</strong></div>
                        <div className="eva-stat"><span>Awaiting payment</span><strong>{counts.awaiting || 0}</strong></div>
                        <div className="eva-stat"><span>Receipts to check</span><strong>{counts.submitted || 0}</strong></div>
                        <div className="eva-stat"><span>Paid</span><strong>{formatMoney(paidTotal, form.currency)}</strong></div>
                    </div>
                    <div className="eva-toolbar">
                        <input className="form-input" placeholder="Search order no., company, contact, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        <span className="spacer" />
                        {FILTERS.map((item) => (
                            <button key={item.key} type="button" className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(item.key)}>
                                {item.label}{counts[item.key] ? ` (${counts[item.key]})` : ''}
                            </button>
                        ))}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); load(); }}>Refresh</button>
                    </div>
                    {visible.length === 0 ? (
                        <div className="eva-empty">{orders.length ? 'No orders match.' : 'No electricity orders yet. Share the vendor link to start receiving them.'}</div>
                    ) : visible.map((order) => (
                        <OrderCard key={order.id} order={order} busy={busy} onAction={action} onSaveNotes={saveNotes} onDelete={remove} />
                    ))}
                </div>
            ) : (
                <FormSetup form={form} onSave={saveForm} saving={busy} />
            )}
        </div>
    );
}
