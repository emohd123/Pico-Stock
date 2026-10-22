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

/** Share of the client total (excl. VAT), e.g. 85%. */
function pct(part, total) {
    if (part === null || part === undefined || !total) return '';
    const value = (Number(part) / Number(total)) * 100;
    return `${Math.round(value * 10) / 10}%`;
}

/** Amount with its % of the client total underneath. */
function MoneyPct({ value, total }) {
    const share = pct(value, total);
    return (
        <>
            {money(value)}
            {share && <small className="mr-pct">{share}</small>}
        </>
    );
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function downloadCsv(report) {
    const header = ['Event', 'Reference', 'Client', 'Confirmed', 'Item', 'Supplier', 'Qty', 'Client unit (BHD)', 'Client total (BHD)', 'Supplier unit cost (BHD)', 'Pay supplier (BHD)', 'Supplier %', 'Client share (BHD)', 'Client %', 'Our net (BHD)', 'Our %'];
    const rows = report.lines.map((line) => [
        line.eventName, line.reference, line.company, formatDate(line.confirmedAt), itemLabel(line.itemName), line.supplierName,
        line.quantity, line.clientUnit, line.clientTotal, line.supplierUnitCost ?? '', line.supplierCost ?? '', pct(line.supplierCost, line.clientTotal),
        line.clientShare, pct(line.clientShare, line.clientTotal), line.ourNet ?? '', pct(line.ourNet, line.clientTotal),
    ]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pico-margin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/** The organizer client's % of each sale, per event. Saving recalculates the whole report. */
function ClientShareSetting({ event, onSaved }) {
    const [value, setValue] = useState(String(event.clientSharePercent));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { setValue(String(event.clientSharePercent)); }, [event.clientSharePercent]);

    const dirty = Number(value) !== Number(event.clientSharePercent);

    async function save(e) {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const response = await fetch('/api/reports/event-margin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: event.id, clientSharePercent: Number(value) }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.error || 'Could not save.');
            onSaved(data);
        } catch (err) {
            setError(err.message || 'Could not save.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form className="mr-share" onSubmit={save}>
            <label>
                <span>Client % · {event.name}</span>
                <span className="mr-share-input">
                    <input
                        className="form-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                    />
                    <b>%</b>
                </span>
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !dirty || value === ''}>
                {saving ? 'Saving…' : 'Save & recalculate'}
            </button>
            <small>The client&apos;s share of every sale (price excl. VAT), on all items including Pico own stock. 0% = no client share.</small>
            {error && <small className="mr-share-err">{error}</small>}
        </form>
    );
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
    const summary = report?.summary;

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
                    <div className="eva-card mr-share-card">
                        {(report.events || []).map((event) => (
                            <ClientShareSetting key={event.id} event={event} onSaved={setReport} />
                        ))}
                    </div>

                    <div className="eva-summary-strip">
                        <div className="eva-stat"><span>Confirmed requests</span><strong>{summary.confirmedRequests}</strong></div>
                        <div className="eva-stat"><span>Client total (excl. VAT)</span><strong>{money(summary.clientTotal)}</strong><small className="mr-pct">100%</small></div>
                        <div className="eva-stat"><span>Pay suppliers</span><strong>{money(summary.payToSuppliers)}</strong><small className="mr-pct">{pct(summary.payToSuppliers, summary.clientTotal)}</small></div>
                        <div className="eva-stat"><span>Client share</span><strong>{money(summary.clientShare)}</strong><small className="mr-pct">{pct(summary.clientShare, summary.clientTotal)}</small></div>
                        <div className="eva-stat mr-stat-net"><span>Our net (Pico)</span><strong>{money(summary.ourNet)}</strong><small className="mr-pct">{pct(summary.ourNet, summary.clientTotal)}</small></div>
                    </div>

                    {summary.linesMissingCost > 0 && (
                        <div className="eva-flash warn">
                            {summary.linesMissingCost} line{summary.linesMissingCost === 1 ? ' has' : 's have'} no supplier cost on the product, so {summary.linesMissingCost === 1 ? 'its' : 'their'} margin is left out. Add the cost price in Products.
                        </div>
                    )}

                    {summary.confirmedRequests === 0 ? (
                        <div className="eva-empty">No confirmed requests yet. Mark a request as Confirmed in the event admin and it appears here.</div>
                    ) : (
                        <>
                            <div className="eva-card">
                                <h3 style={{ marginTop: 0 }}>By supplier — who we pay</h3>
                                <div className="eva-table-wrap">
                                    <table className="eva-table">
                                        <thead><tr><th>Supplier</th><th className="num">Qty</th><th className="num">Client total</th><th className="num">Pay supplier</th><th className="num">Client share</th><th className="num">Our net</th></tr></thead>
                                        <tbody>
                                            {report.bySupplier.map((row) => (
                                                <tr key={row.supplier}>
                                                    <td>{row.supplierName}</td>
                                                    <td className="num">{row.quantity}</td>
                                                    <td className="num">{money(row.clientTotal)}</td>
                                                    <td className="num">{row.supplier === 'pico' ? '— (own stock)' : <MoneyPct value={row.supplierCost} total={row.clientTotal} />}</td>
                                                    <td className="num"><MoneyPct value={row.clientShare} total={row.clientTotal} /></td>
                                                    <td className="num"><MoneyPct value={row.ourNet} total={row.clientTotal} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td>Total</td>
                                                <td className="num">{report.bySupplier.reduce((sum, row) => sum + row.quantity, 0)}</td>
                                                <td className="num">{money(summary.clientTotal)}</td>
                                                <td className="num"><MoneyPct value={summary.payToSuppliers} total={summary.clientTotal} /></td>
                                                <td className="num"><MoneyPct value={summary.clientShare} total={summary.clientTotal} /></td>
                                                <td className="num"><MoneyPct value={summary.ourNet} total={summary.clientTotal} /></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>

                            <div className="eva-card">
                                <h3 style={{ marginTop: 0 }}>By client</h3>
                                <div className="eva-table-wrap">
                                    <table className="eva-table">
                                        <thead><tr><th>Event</th><th>Reference</th><th>Client</th><th>Confirmed</th><th className="num">Client total</th><th className="num">Incl. VAT</th><th className="num">Pay suppliers</th><th className="num">Client share</th><th className="num">Our net</th></tr></thead>
                                        <tbody>
                                            {report.requests.map((request) => (
                                                <tr key={request.reference}>
                                                    <td>{request.eventName}</td>
                                                    <td>{request.reference}</td>
                                                    <td>{request.company}</td>
                                                    <td>{formatDate(request.confirmedAt)}</td>
                                                    <td className="num">{money(request.clientTotal)}</td>
                                                    <td className="num">{money(request.totalWithVat)}</td>
                                                    <td className="num"><MoneyPct value={request.supplierCost} total={request.clientTotal} /></td>
                                                    <td className="num"><MoneyPct value={request.clientShare} total={request.clientTotal} /></td>
                                                    <td className="num"><MoneyPct value={request.ourNet} total={request.clientTotal} /></td>
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
                                        <thead><tr><th>Reference</th><th>Client</th><th>Item</th><th>Supplier</th><th className="num">Qty</th><th className="num">Client unit</th><th className="num">Client total</th><th className="num">Supplier unit cost</th><th className="num">Pay supplier</th><th className="num">Client share</th><th className="num">Our net</th></tr></thead>
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
                                                    <td className="num">{line.supplier === 'pico' ? '—' : <MoneyPct value={line.supplierCost} total={line.clientTotal} />}</td>
                                                    <td className="num"><MoneyPct value={line.clientShare} total={line.clientTotal} /></td>
                                                    <td className="num"><MoneyPct value={line.ourNet} total={line.clientTotal} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    <p className="eva-hint" style={{ margin: 0 }}>
                        Client total = the unit prices on each request × quantity (excl. VAT) = 100%. Pay supplier = the supplier&apos;s 1-day price on the product × event days (today&apos;s cost prices).
                        Client share = client total × client %. Our net = client total − pay supplier − client share. The % under each amount is its share of the client total.
                    </p>
                </>
            )}
        </div>
    );
}
