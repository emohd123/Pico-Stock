'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { formatCurrencyAmount, normalizeCurrencyCode } from '@/lib/quotationCommercial';

const STATUS_COLORS = {
    Draft: '#f4b740',
    Confirmed: '#14b8a6',
    Cancelled: '#ef4444',
};

const DATE_PRESETS = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_30_days', label: 'Last 30 Days' },
    { key: 'year_to_date', label: 'Year to Date' },
];

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatIso(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function currentMonthRange() {
    const now = new Date();
    return {
        from: formatIso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: formatIso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
}

function dateRangeFromPreset(preset) {
    const now = new Date();
    if (preset === 'last_30_days') {
        const from = new Date(now);
        from.setDate(from.getDate() - 29);
        return { from: formatIso(from), to: formatIso(now) };
    }
    if (preset === 'year_to_date') {
        return { from: formatIso(new Date(now.getFullYear(), 0, 1)), to: formatIso(now) };
    }
    return currentMonthRange();
}

function formatPercent(value) {
    return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function formatCurrencyGroup(grouped = {}) {
    const entries = Object.entries(grouped);
    if (entries.length === 0) return '--';
    return entries
        .map(([currencyCode, value]) => formatCurrencyAmount(value, currencyCode, { withCode: true }))
        .join(' | ');
}

function moneyByCurrency(grouped = {}, preferredCurrency = null) {
    const entries = Object.entries(grouped);
    if (entries.length === 0) return '--';
    if (preferredCurrency && grouped[preferredCurrency] !== undefined) {
        return formatCurrencyAmount(grouped[preferredCurrency], preferredCurrency, { withCode: true });
    }
    if (entries.length === 1) {
        return formatCurrencyAmount(entries[0][1], entries[0][0], { withCode: true });
    }
    return formatCurrencyGroup(grouped);
}

function chartTooltipValue(value, name, context) {
    if (name === 'value' && context?.payload?.currencyCode) {
        return formatCurrencyAmount(value, context.payload.currencyCode, { withCode: true });
    }
    return value;
}

function formatDateLabel(dateValue) {
    if (!dateValue) return '--';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return dateValue;
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

async function readJsonResponse(response, fallbackMessage) {
    const raw = await response.text();
    let data = null;

    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        if (!response.ok) {
            throw new Error(fallbackMessage);
        }
        throw new Error('Received an invalid server response.');
    }

    if (!response.ok) {
        throw new Error(data?.error || fallbackMessage);
    }

    return data;
}

function ReportsKpi({ label, value, tone = 'neutral', subcopy }) {
    return (
        <div className={`quotation-report-kpi quotation-report-kpi-${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            {subcopy ? <small>{subcopy}</small> : null}
        </div>
    );
}

export default function QuotationReports() {
    const initialRange = currentMonthRange();
    const [preset, setPreset] = useState('this_month');
    const [filters, setFilters] = useState({
        from: initialRange.from,
        to: initialRange.to,
        status: '',
        owner: '',
        customer: '',
    });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isPrinting, setIsPrinting] = useState(false);
    const [aiSummary, setAiSummary] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');

    useEffect(() => {
        let ignore = false;

        async function loadReport() {
            setLoading(true);
            setError('');
            try {
                const query = new URLSearchParams();
                if (filters.from) query.set('from', filters.from);
                if (filters.to) query.set('to', filters.to);
                if (filters.status) query.set('status', filters.status);
                if (filters.owner) query.set('owner', filters.owner);
                if (filters.customer) query.set('customer', filters.customer);

                const response = await fetch(`/api/quotations/reports?${query.toString()}`, { cache: 'no-store' });
                const data = await readJsonResponse(response, 'Failed to load reports');
                if (!ignore) {
                    setReport(data);
                }
            } catch (loadError) {
                if (!ignore) {
                    setError(loadError.message || 'Failed to load reports');
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        loadReport();
        return () => {
            ignore = true;
        };
    }, [filters]);

    useEffect(() => {
        if (!report) {
            setAiSummary(null);
            setAiError('');
            return;
        }

        let ignore = false;

        async function loadAiSummary() {
            setAiLoading(true);
            setAiError('');
            try {
                const response = await fetch('/api/quotations/ai/report-summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ report }),
                });
                const data = await readJsonResponse(response, 'AI summary is temporarily unavailable.');
                if (!ignore) {
                    setAiSummary(data);
                }
            } catch (summaryError) {
                if (!ignore) {
                    setAiError(summaryError.message || 'Failed to load AI summary');
                    setAiSummary(null);
                }
            } finally {
                if (!ignore) {
                    setAiLoading(false);
                }
            }
        }

        loadAiSummary();
        return () => {
            ignore = true;
        };
    }, [report]);

    function applyPreset(nextPreset) {
        const range = dateRangeFromPreset(nextPreset);
        setPreset(nextPreset);
        setFilters((current) => ({ ...current, from: range.from, to: range.to }));
    }

    function updateFilter(field, value) {
        setPreset('custom');
        setFilters((current) => ({ ...current, [field]: value }));
    }

    function resetFilters() {
        const range = currentMonthRange();
        setPreset('this_month');
        setFilters({
            from: range.from,
            to: range.to,
            status: '',
            owner: '',
            customer: '',
        });
    }

    const summary = report?.summary || {};
    const reportCurrencyCodes = summary.currencies || [];
    const singleCurrency = reportCurrencyCodes.length === 1 ? normalizeCurrencyCode(reportCurrencyCodes[0]) : null;

    const trendData = useMemo(() => {
        const points = report?.timeseries || [];
        return points.map((point) => ({
            date: point.date.slice(5),
            count: point.quotation_count,
            confirmedCount: point.confirmed_count,
            value: singleCurrency ? Number(point.confirmed_value_by_currency?.[singleCurrency] || 0) : 0,
            currencyCode: singleCurrency,
        }));
    }, [report?.timeseries, singleCurrency]);

    const statusChartData = useMemo(
        () =>
            (report?.status_breakdown || []).map((entry) => ({
                name: entry.status,
                value: entry.count,
                color: STATUS_COLORS[entry.status] || '#94a3b8',
            })),
        [report?.status_breakdown],
    );

    const ownerValueChartData = useMemo(() => {
        if (!singleCurrency) return [];
        return (report?.owner_breakdown || []).slice(0, 7).map((entry) => ({
            label: entry.label,
            value: Number(entry.confirmed_value_by_currency?.[singleCurrency] || 0),
            currencyCode: singleCurrency,
        }));
    }, [report?.owner_breakdown, singleCurrency]);

    const customerValueChartData = useMemo(() => {
        if (!singleCurrency) return [];
        return (report?.customer_breakdown || []).slice(0, 7).map((entry) => ({
            label: entry.label,
            value: Number(entry.confirmed_value_by_currency?.[singleCurrency] || 0),
            currencyCode: singleCurrency,
        }));
    }, [report?.customer_breakdown, singleCurrency]);

    const rows = (report?.rows || []).slice(0, 10);
    const generatedAtLabel = formatDateLabel(report?.generated_at);

    useEffect(() => {
        function handleBeforePrint() {
            setIsPrinting(true);
        }

        function handleAfterPrint() {
            setIsPrinting(false);
        }

        window.addEventListener('beforeprint', handleBeforePrint);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('beforeprint', handleBeforePrint);
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, []);

    function printReport() {
        setIsPrinting(true);
        window.setTimeout(() => {
            window.print();
        }, 60);
    }

    return (
        <div className="quotation-reports-screen">
            <div className="quotation-reports-hero">
                <div>
                    <div className="quotation-dashboard-kicker">Management Reporting</div>
                    <h2>Quotation Reports</h2>
                    <p>Track quotation performance, confirmed pipeline, conversion, owner momentum, and customer value over any selected date window.</p>
                </div>
                <div className="quotation-reports-hero-actions">
                    <div className="quotation-reports-meta">
                        <span>Reporting window</span>
                        <strong>{filters.from} to {filters.to}</strong>
                    </div>
                    <button type="button" className="quotation-btn quotation-btn-primary quotation-report-print-btn" onClick={printReport}>
                        {isPrinting ? 'Preparing Print View...' : 'Print Management View'}
                    </button>
                </div>
            </div>

            <div className="quotation-reports-toolbar">
                <div className="quotation-reports-presets">
                    {DATE_PRESETS.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            className={`quotation-report-chip ${preset === option.key ? 'quotation-report-chip-active' : ''}`}
                            onClick={() => applyPreset(option.key)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="quotation-reports-filters">
                    <label className="quotation-report-filter">
                        <span>From</span>
                        <input type="date" className="quotation-input" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
                    </label>
                    <label className="quotation-report-filter">
                        <span>To</span>
                        <input type="date" className="quotation-input" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
                    </label>
                    <label className="quotation-report-filter">
                        <span>Status</span>
                        <select className="quotation-input" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                            <option value="">All statuses</option>
                            <option value="Draft">Draft</option>
                            <option value="Confirmed">Confirmed</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </label>
                    <label className="quotation-report-filter">
                        <span>Owner</span>
                        <select className="quotation-input" value={filters.owner} onChange={(event) => updateFilter('owner', event.target.value)}>
                            <option value="">All owners</option>
                            {(report?.filter_options?.owners || []).map((owner) => (
                                <option key={owner} value={owner}>{owner}</option>
                            ))}
                        </select>
                    </label>
                    <label className="quotation-report-filter">
                        <span>Customer</span>
                        <select className="quotation-input" value={filters.customer} onChange={(event) => updateFilter('customer', event.target.value)}>
                            <option value="">All customers</option>
                            {(report?.filter_options?.customers || []).map((customer) => (
                                <option key={customer} value={customer}>{customer}</option>
                            ))}
                        </select>
                    </label>
                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-report-reset" onClick={resetFilters}>
                        Reset
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="quotation-report-state">Loading quotation report...</div>
            ) : error ? (
                <div className="quotation-report-state quotation-report-state-error">{error}</div>
            ) : (
                <>
                    <section className="quotation-report-print-header">
                        <div>
                            <div className="quotation-dashboard-kicker">Pico Bahrain</div>
                            <h1>Quotation Performance Report</h1>
                            <p>Prepared for management review with live quotation data from Quotation Studio.</p>
                        </div>
                        <div className="quotation-report-print-meta">
                            <span>Window</span>
                            <strong>{report?.filters?.from} to {report?.filters?.to}</strong>
                            <span>Generated</span>
                            <strong>{generatedAtLabel}</strong>
                            <span>Filters</span>
                            <strong>
                                {[
                                    report?.filters?.status || 'All statuses',
                                    report?.filters?.owner || 'All owners',
                                    report?.filters?.customer || 'All customers',
                                ].join(' | ')}
                            </strong>
                        </div>
                    </section>

                    <section className="quotation-report-card quotation-report-card-wide" style={{ marginBottom: '1.35rem' }}>
                        <div className="quotation-report-card-head">
                            <div>
                                <h3>AI Management Summary</h3>
                                <p>Internal narrative summary of the filtered quotation performance window.</p>
                            </div>
                        </div>
                        {aiLoading ? (
                            <div className="quotation-report-empty-note">Preparing AI management summary...</div>
                        ) : aiError ? (
                            <div className="quotation-report-empty-note" style={{ color: '#b91c1c' }}>{aiError}</div>
                        ) : aiSummary ? (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                <div style={{ color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                    {String(aiSummary.summary_markdown || '').replace(/\*\*/g, '')}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                                    <div style={{ padding: '0.95rem 1rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.45rem' }}>Highlights</div>
                                        <ul style={{ margin: 0, paddingLeft: '1rem', color: '#475569', lineHeight: 1.7 }}>
                                            {(aiSummary.highlights || []).map((item, index) => <li key={`highlight-${index}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                    <div style={{ padding: '0.95rem 1rem', borderRadius: '14px', background: '#fffaf0', border: '1px solid #fde68a' }}>
                                        <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.45rem' }}>Risks</div>
                                        <ul style={{ margin: 0, paddingLeft: '1rem', color: '#78350f', lineHeight: 1.7 }}>
                                            {(aiSummary.risks || []).length ? (aiSummary.risks || []).map((item, index) => <li key={`risk-${index}`}>{item}</li>) : <li>No major risks flagged for this range.</li>}
                                        </ul>
                                    </div>
                                    <div style={{ padding: '0.95rem 1rem', borderRadius: '14px', background: '#ecfeff', border: '1px solid #a5f3fc' }}>
                                        <div style={{ fontWeight: 700, color: '#155e75', marginBottom: '0.45rem' }}>Recommended Actions</div>
                                        <ul style={{ margin: 0, paddingLeft: '1rem', color: '#164e63', lineHeight: 1.7 }}>
                                            {(aiSummary.actions || []).map((item, index) => <li key={`action-${index}`}>{item}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="quotation-report-empty-note">No AI summary is available for the current filters.</div>
                        )}
                    </section>

                    <div className="quotation-reports-kpis">
                        <ReportsKpi label="Total Quotations" value={summary.total_count || 0} tone="neutral" />
                        <ReportsKpi label="Confirmed Quotations" value={summary.confirmed_count || 0} tone="positive" />
                        <ReportsKpi label="Draft Quotations" value={summary.draft_count || 0} tone="warning" />
                        <ReportsKpi label="Conversion Rate" value={formatPercent(summary.conversion_rate)} tone="neutral" />
                        <ReportsKpi
                            label="Confirmed Pipeline"
                            value={moneyByCurrency(summary.confirmed_pipeline_by_currency, singleCurrency)}
                            tone="primary"
                            subcopy={singleCurrency ? '' : 'Grouped by currency'}
                        />
                        <ReportsKpi
                            label="Average Quotation Value"
                            value={moneyByCurrency(summary.average_value_by_currency, singleCurrency)}
                            tone="neutral"
                            subcopy={singleCurrency ? '' : 'Grouped by currency'}
                        />
                    </div>

                    <div className="quotation-reports-grid">
                        <section className="quotation-report-card quotation-report-card-wide">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Quotation Trend</h3>
                                    <p>Daily quotation volume across the selected range.</p>
                                </div>
                            </div>
                            <div className="quotation-report-chart">
                                <ResponsiveContainer width="100%" height={280}>
                                    <LineChart data={trendData}>
                                        <CartesianGrid stroke="#e2ebf2" strokeDasharray="3 3" />
                                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="count" name="Total Quotations" stroke="#0fb7ae" strokeWidth={2.5} dot={false} />
                                        <Line type="monotone" dataKey="confirmedCount" name="Confirmed" stroke="#2563eb" strokeWidth={2.3} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section className="quotation-report-card">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Status Distribution</h3>
                                    <p>Current mix of quotation states for the selected period.</p>
                                </div>
                            </div>
                            <div className="quotation-report-chart">
                                <ResponsiveContainer width="100%" height={280}>
                                    <PieChart>
                                        <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={4}>
                                            {statusChartData.map((entry) => (
                                                <Cell key={entry.name} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </section>

                        <section className="quotation-report-card">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Value by Owner</h3>
                                    <p>{singleCurrency ? 'Confirmed quotation value by owner.' : 'Mixed currencies detected. Use the owner table for grouped totals.'}</p>
                                </div>
                            </div>
                            {singleCurrency ? (
                                <div className="quotation-report-chart">
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={ownerValueChartData}>
                                            <CartesianGrid stroke="#e2ebf2" strokeDasharray="3 3" />
                                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                                            <Tooltip formatter={chartTooltipValue} />
                                            <Bar dataKey="value" fill="#14b8a6" radius={[10, 10, 2, 2]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="quotation-report-empty-note">Value chart is hidden because the filtered range contains multiple currencies.</div>
                            )}
                        </section>

                        <section className="quotation-report-card">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Value by Customer</h3>
                                    <p>{singleCurrency ? 'Top customers ranked by confirmed quotation value.' : 'Mixed currencies detected. Use the customer table for grouped totals.'}</p>
                                </div>
                            </div>
                            {singleCurrency ? (
                                <div className="quotation-report-chart">
                                    <ResponsiveContainer width="100%" height={280}>
                                        <BarChart data={customerValueChartData} layout="vertical" margin={{ left: 18 }}>
                                            <CartesianGrid stroke="#e2ebf2" strokeDasharray="3 3" />
                                            <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                                            <YAxis dataKey="label" type="category" width={110} tick={{ fill: '#64748b', fontSize: 11 }} />
                                            <Tooltip formatter={chartTooltipValue} />
                                            <Bar dataKey="value" fill="#2563eb" radius={[0, 10, 10, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="quotation-report-empty-note">Value chart is hidden because the filtered range contains multiple currencies.</div>
                            )}
                        </section>
                    </div>

                    <div className="quotation-reports-table-grid">
                        <section className="quotation-report-card">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Top Owners</h3>
                                    <p>Confirmed value and quotation count by owner.</p>
                                </div>
                            </div>
                            <div className="quotation-report-table">
                                {(report?.owner_breakdown || []).slice(0, 8).map((entry) => (
                                    <div key={entry.label} className="quotation-report-table-row">
                                        <div>
                                            <strong>{entry.label}</strong>
                                            <span>{entry.quotation_count} quotations | {entry.confirmed_count} confirmed</span>
                                        </div>
                                        <strong>{moneyByCurrency(entry.confirmed_value_by_currency, singleCurrency)}</strong>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="quotation-report-card">
                            <div className="quotation-report-card-head">
                                <div>
                                    <h3>Top Customers</h3>
                                    <p>Confirmed value and quotation count by customer.</p>
                                </div>
                            </div>
                            <div className="quotation-report-table">
                                {(report?.customer_breakdown || []).slice(0, 8).map((entry) => (
                                    <div key={entry.label} className="quotation-report-table-row">
                                        <div>
                                            <strong>{entry.label}</strong>
                                            <span>{entry.quotation_count} quotations | {entry.confirmed_count} confirmed</span>
                                        </div>
                                        <strong>{moneyByCurrency(entry.confirmed_value_by_currency, singleCurrency)}</strong>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <section className="quotation-report-card quotation-report-card-wide">
                        <div className="quotation-report-card-head">
                            <div>
                                <h3>Recent Quotations in Range</h3>
                                <p>Management-ready table for the latest filtered quotations.</p>
                            </div>
                        </div>
                        <div className="quotation-report-rows">
                            {rows.length === 0 ? (
                                <div className="quotation-report-empty-note">No quotations match the current filters.</div>
                            ) : rows.map((row) => (
                                <div key={row.id} className="quotation-report-row-item">
                                    <div>
                                        <strong>QT-{row.qt_number}</strong>
                                        <span>{row.project_title || 'Untitled quotation'} | {row.client_org || row.client_to || 'No client'}</span>
                                    </div>
                                    <div>{row.created_by || 'Unassigned'}</div>
                                    <div>{row.date || '--'}</div>
                                    <div><span className={`quotation-status-pill quotation-status-pill-${String(row.status || 'Draft').toLowerCase()}`}>{row.status}</span></div>
                                    <div className="quotation-report-row-total">{row.formatted_total}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
