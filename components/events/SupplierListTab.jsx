'use client';

import { Fragment, useMemo, useState } from 'react';
import { SUPPLIER_LIST_SCOPES, buildSupplierList, supplierListText } from '@/lib/eventSupplierList';

function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Event admin tab: every requested item added up across requests, grouped by
 * supplier, with a printable sheet per supplier to send them.
 */
export default function SupplierListTab({ slug, config, requests }) {
    const [scope, setScope] = useState('confirmed');
    const [showClients, setShowClients] = useState(true);
    const [copied, setCopied] = useState('');
    const list = useMemo(() => buildSupplierList(requests, scope), [requests, scope]);

    const printUrl = (supplier) => `/admin/print/supplier-list/${slug}?scope=${scope}${supplier ? `&supplier=${supplier}` : ''}`;

    async function copy(group) {
        try {
            await navigator.clipboard.writeText(supplierListText(group, config.name));
            setCopied(group.supplier);
            setTimeout(() => setCopied(''), 1800);
        } catch {}
    }

    function downloadCsv() {
        const rows = [['Supplier', 'Item', 'Code', 'Size', 'Total quantity', 'Requests (reference: company × qty)']];
        for (const group of list.suppliers) {
            for (const item of group.items) {
                rows.push([group.supplierName, item.name, item.code, item.size, item.quantity,
                    item.clients.map((client) => `${client.reference}: ${client.company} × ${client.quantity}`).join('; ')]);
            }
        }
        const blob = new Blob([`﻿${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${slug}-supplier-list-${scope}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    return (
        <>
            <div className="eva-summary-strip">
                <div className="eva-stat"><span>Requests included</span><strong>{list.requestCount}</strong></div>
                <div className="eva-stat"><span>Suppliers</span><strong>{list.suppliers.length}</strong></div>
                <div className="eva-stat"><span>Different items</span><strong>{list.lineCount}</strong></div>
                <div className="eva-stat"><span>Total pieces</span><strong>{list.totalQuantity}</strong></div>
            </div>

            <div className="eva-toolbar">
                <select className="form-select" style={{ maxWidth: 260 }} value={scope} onChange={(e) => setScope(e.target.value)}>
                    {Object.entries(SUPPLIER_LIST_SCOPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <label className="sl-toggle">
                    <input type="checkbox" checked={showClients} onChange={(e) => setShowClients(e.target.checked)} />
                    Show which clients ordered
                </label>
                <span className="spacer" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadCsv} disabled={!list.lineCount}>Download CSV</button>
                <a className="btn btn-primary btn-sm" href={printUrl('')} target="_blank" rel="noopener noreferrer" aria-disabled={!list.lineCount}>Print all (PDF)</a>
            </div>

            {list.suppliers.length === 0 ? (
                <div className="eva-empty">
                    {scope === 'confirmed' ? 'No confirmed requests yet. Switch to "All requests except declined" to see what is pending.' : 'No requests yet.'}
                </div>
            ) : list.suppliers.map((group) => (
                <section key={group.supplier} className="eva-card sl-group">
                    <div className="sl-group-head">
                        <div>
                            <h3>{group.supplierName}</h3>
                            <p className="sl-group-sub">{group.items.length} item{group.items.length === 1 ? '' : 's'} · <strong>{group.totalQuantity}</strong> piece{group.totalQuantity === 1 ? '' : 's'} in total</p>
                        </div>
                        <div className="sl-group-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(group)}>{copied === group.supplier ? 'Copied' : 'Copy as text'}</button>
                            <a className="btn btn-primary btn-sm" href={printUrl(group.supplier)} target="_blank" rel="noopener noreferrer">Print / PDF for supplier</a>
                        </div>
                    </div>
                    <div className="eva-table-wrap">
                        <table className="eva-table sl-table">
                            <thead>
                                <tr><th style={{ width: 70 }}>Picture</th><th>Item</th><th className="num">Total qty</th>{showClients && <th>Requested by</th>}</tr>
                            </thead>
                            <tbody>
                                {group.items.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.image ? <img className="sl-thumb" src={item.image} alt="" /> : <div className="sl-thumb sl-noimg" />}</td>
                                        <td>
                                            <div className="eva-item-name">{item.name}</div>
                                            {(item.code || item.size) && <div className="eva-item-sub">{[item.code, item.size].filter(Boolean).join(' · ')}</div>}
                                        </td>
                                        <td className="num"><span className="sl-qty">{item.quantity}</span></td>
                                        {showClients && (
                                            <td className="sl-clients">
                                                {item.clients.map((client, index) => (
                                                    <Fragment key={`${client.reference}-${index}`}>
                                                        <span><b>{client.quantity}×</b> {client.company} <em>{client.reference}</em>{client.comment ? ` — ${client.comment}` : ''}</span>
                                                    </Fragment>
                                                ))}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            ))}
        </>
    );
}
