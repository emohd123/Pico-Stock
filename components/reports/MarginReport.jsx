'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractCleanName } from '@/lib/nameHelpers';
import { formatMoney } from '@/lib/eventMarketplacePricing';
import '@/components/events/event-marketplace.css';

const CURRENCY = 'BHD';

function itemLabel(name) {
    if (!/^ID\b/i.test(name || '')) return name;
    const clean = extractCleanName(name);
    return clean === '--' ? name : clean;
}

function money(value) {
    return value === null || value === undefined ? '—' : formatMoney(value, CURRENCY);
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function downloadCsv(report) {
    const header = ['Event', 'Reference', 'Client', 'Confirmed', 'Item', 'Supplier', 'Qty', 'Client unit (BHD)', 'Client total (BHD)', 'Supplier unit cost (BHD)', 'Pay supplier (BHD)', 'Our margin (BHD)'];
    const rows = report.lines.map((line) => [
        line.eventName, line.reference, line.company, formatDate(line.confirmedAt), itemLabel(line.itemName), line.supplierName,
        line.quantity, line.clientUnit, line.clientTotal, line.supplierUnitCost ?? '', line.supplierCost ?? '', line.margin ?? '',
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pico-margin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

export default function MarginReport() {
    const [report, setReport] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [supplierFilter, setSupplierFilter] = useState('all');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch('/api/reports/event-margin', { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Unable to load the report.');
            setReport(data);
        } catch (err) {
            setError(err.message || 'Unable to load the report.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const lines = useMemo(() => (report?.lines || []).filter((line) => supplierFilter === 'all' || line.supplier === supplierFilter), [report, supplierFilter]);

    return (
        <div className="eva-page">
            <div className="eva-head">
                <div>
                    <h2>Margin report</h2>
                    <p>Confirmed event requests only. Internal — shows which supplier each item comes from.</p>
                </div>
                <div className="eva-actions" style={{ marginTop: 0 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => report && downloadCsv(report)} disabled={!report || report.lines.length === 0}>Download CSV</button>
                </div>
            </div>

            {error && <div className="eva-flash err">{error}</div>}

            {report && (
                <>
                    <div className="eva-summary-strip">
                        <div className="eva-stat"><span>Confirmed requests</span><strong>{report.summary.confirmedRequests}</strong></div>
                        <div className="eva-stat"><span>Client total (excl. VAT)</span><strong>{money(report.summary.clientTotal)}</strong></div>
                        <div className="eva-stat"><span>To pay suppliers</span><strong>{money(report.summary.payToSuppliers)}</strong></div>
                        <div className="eva-stat"><span>Our margin on supplier items</span><strong>{money(report.summary.marginOnSupplierItems)}</strong></div>
                        <div className="eva-stat"><span>Pico own stock revenue</span><strong>{money(report.summary.ownStockRevenue)}</strong></div>
                        <div className="eva-stat"><span>Total for Pico</span><strong>{money(report.summary.totalEarnings)}</strong></div>
                    </div>

                    {report.summary.linesMissingCost > 0 && (
                        <div className="eva-flash warn">
                            {report.summary.linesMissingCost} line{report.summary.linesMissingCost === 1 ? ' has' : 's have'} no supplier cost on the product, so {report.summary.linesMissingCost === 1 ? 'its' : 'their'} margin is left out. Add the cost price in Products.
                        </div>
                    )}

                    {report.summary.confirmedRequests === 0 ? (
                        <div className="eva-empty">No confirmed requests yet. Mark a request as Confirmed in the event admin and it appears here.</div>
                    ) : (
                        <>
                            <div className="eva-card">
                                <h3 style={{ marginTop: 0 }}>By supplier — who we pay</h3>
                                <div className="eva-table-wrap">
                                    <table className="eva-table">
                                        <thead><tr><th>Supplier</th><th className="num">Qty</th><th className="num">Client total</th><th className="num">Pay supplier</th><th className="num">Our margin</th></tr></thead>
                                        <tbody>
                                            {report.bySupplier.map((row) => (
                                                <tr key={row.supplier}>
                                                    <td>{row.supplierName}</td>
                                                    <td className="num">{row.quantity}</td>
                                                    <td className="num">{money(row.clientTotal)}</td>
                                                    <td className="num">{row.supplier === 'pico' ? '—' : money(row.supplierCost)}</td>
                                                    <td className="num">{row.supplier === 'pico' ? `${money(row.margin)} (own stock)` : money(row.margin)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="eva-card">
                                <h3 style={{ marginTop: 0 }}>By client</h3>
                                <div className="eva-table-wrap">
                                    <table className="eva-table">
                                        <thead><tr><th>Event</th><th>Reference</th><th>Client</th><th>Confirmed</th><th className="num">Client total</th><th className="num">Incl. VAT</th><th className="num">Pay suppliers</th><th className="num">Our margin</th></tr></thead>
                                        <tbody>
                                            {report.requests.map((request) => (
                                                <tr key={request.reference}>
                                                    <td>{request.eventName}</td>
                                                    <td>{request.reference}</td>
                                                    <td>{request.company}</td>
                                                    <td>{formatDate(request.confirmedAt)}</td>
                                                    <td className="num">{money(request.clientTotal)}</td>
                                                    <td className="num">{money(request.totalWithVat)}</td>
                                                    <td className="num">{money(request.supplierCost)}</td>
                                                    <td className="num">{money(request.margin)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="eva-card">
                                <div className="eva-toolbar" style={{ marginBottom: '0.8rem' }}>
                                    <h3 style={{ margin: 0 }}>Item lines</h3>
                                    <span className="spacer" />
                                    <select className="form-input" style={{ maxWidth: 260 }} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                                        <option value="all">All suppliers</option>
                                        {report.bySupplier.map((row) => <option key={row.supplier} value={row.supplier}>{row.supplierName}</option>)}
                                    </select>
                                </div>
                                <div className="eva-table-wrap">
                                    <table className="eva-table">
                                        <thead><tr><th>Reference</th><th>Client</th><th>Item</th><th>Supplier</th><th className="num">Qty</th><th className="num">Client unit</th><th className="num">Client total</th><th className="num">Supplier unit cost</th><th className="num">Pay supplier</th><th className="num">Our margin</th></tr></thead>
                                        <tbody>
                                            {lines.map((line, index) => (
                                                <tr key={`${line.requestId}-${line.itemId}-${index}`}>
                                                    <td>{line.reference}</td>
                                                    <td>{line.company}</td>
                                                    <td>{itemLabel(line.itemName)}</td>
                                                    <td>{line.supplierName}</td>
                                                    <td className="num">{line.quantity}</td>
                                                    <td className="num">{money(line.clientUnit)}</td>
                                                    <td className="num">{money(line.clientTotal)}</td>
                                                    <td className="num">{line.supplier === 'pico' ? '—' : money(line.supplierUnitCost)}</td>
                                                    <td className="num">{line.supplier === 'pico' ? '—' : money(line.supplierCost)}</td>
                                                    <td className="num">{money(line.margin)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    <p className="eva-hint" style={{ margin: 0 }}>
                        Client prices are the unit prices on each request (excl. VAT). Supplier cost = the supplier&apos;s 1-day price on the product × event days. Supplier costs use today&apos;s product cost prices.
                    </p>
                </>
            )}
        </div>
    );
}
