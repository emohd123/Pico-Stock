'use client';

import { useEffect, useMemo, useState } from 'react';
import { SUPPLIER_LIST_SCOPES, buildSupplierList } from '@/lib/eventSupplierList';
import './supplier-list-print.css';

function formatDay(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Printable requirement list for suppliers (white, A4). By default it shows
 * items, pictures and total quantities only; "Show clients" adds who ordered
 * what, for internal use.
 */
export default function SupplierListPrint({ slug, supplier = '', scope = 'confirmed' }) {
    const [config, setConfig] = useState(null);
    const [requests, setRequests] = useState([]);
    const [error, setError] = useState('');
    const [showClients, setShowClients] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [configRes, requestsRes] = await Promise.all([
                    fetch(`/api/events/${slug}/admin`, { cache: 'no-store' }),
                    fetch(`/api/events/${slug}/requests`, { cache: 'no-store' }),
                ]);
                const configJson = await configRes.json();
                const requestsJson = await requestsRes.json();
                if (!configRes.ok) throw new Error(configJson?.error || 'Could not load the event.');
                if (!requestsRes.ok) throw new Error(requestsJson?.error || 'Could not load the requests.');
                setConfig(configJson.config);
                setRequests(requestsJson);
            } catch (err) {
                setError(err.message || 'Could not load the list.');
            }
        })();
    }, [slug]);

    const list = useMemo(() => buildSupplierList(requests, scope), [requests, scope]);
    const groups = supplier ? list.suppliers.filter((group) => group.supplier === supplier) : list.suppliers;

    if (error) return <div className="slp-page"><p className="slp-msg">{error}</p></div>;
    if (!config) return <div className="slp-page"><p className="slp-msg">Loading…</p></div>;

    const dates = [formatDay(config.startDate), formatDay(config.endDate)].filter(Boolean).join(' – ');
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="slp-page">
            <div className="slp-toolbar">
                <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>
                <label><input type="checkbox" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} /> Show clients (internal)</label>
                <span>{SUPPLIER_LIST_SCOPES[scope] || ''} · {list.requestCount} request{list.requestCount === 1 ? '' : 's'}</span>
            </div>

            {groups.length === 0 && <p className="slp-msg">Nothing to list for this supplier yet.</p>}

            {groups.map((group) => (
                <section key={group.supplier} className="slp-sheet">
                    <header className="slp-head">
                        <img src="/branding/Pico%20logo%20horizontal%203265c.png" alt="Pico" className="slp-logo" />
                        <div className="slp-head-text">
                            <span>Requirement list</span>
                            <h1>{group.supplierName}</h1>
                        </div>
                    </header>
                    <div className="slp-meta">
                        <div><span>Event</span><strong>{config.name}</strong></div>
                        {dates && <div><span>Dates</span><strong>{dates}</strong></div>}
                        {config.venue && <div><span>Venue</span><strong>{config.venue}</strong></div>}
                        <div><span>Prepared</span><strong>{today}</strong></div>
                    </div>

                    <table className="slp-table">
                        <thead>
                            <tr><th>#</th><th>Picture</th><th>Item</th><th className="num">Quantity</th></tr>
                        </thead>
                        <tbody>
                            {group.items.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="slp-no">{index + 1}</td>
                                    <td>{item.image ? <img src={item.image} alt="" className="slp-img" /> : <div className="slp-img" />}</td>
                                    <td>
                                        <strong>{item.name}</strong>
                                        {(item.code || item.size) && <small>{[item.code, item.size].filter(Boolean).join(' · ')}</small>}
                                        {showClients && (
                                            <ul className="slp-clients">
                                                {item.clients.map((client, i) => <li key={i}>{client.quantity} × {client.company} ({client.reference}){client.comment ? ` — ${client.comment}` : ''}</li>)}
                                            </ul>
                                        )}
                                    </td>
                                    <td className="num slp-qty">{item.quantity}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr><td colSpan={3}>Total: {group.items.length} item{group.items.length === 1 ? '' : 's'}</td><td className="num">{group.totalQuantity}</td></tr>
                        </tfoot>
                    </table>
                    <p className="slp-foot">Pico International (Bahrain) W.L.L · Please confirm availability and delivery for the event dates.</p>
                </section>
            ))}
        </div>
    );
}
