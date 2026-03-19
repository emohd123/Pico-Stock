'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const MODULE_ENDPOINTS = {
    clients: '/api/pcloud/insights/clients',
    trends: '/api/pcloud/insights/trends',
    distribution: '/api/pcloud/insights/distribution',
    folders: '/api/pcloud/insights/folders',
    review: '/api/pcloud/insights/review',
    health: '/api/pcloud/insights/health',
};

const INITIAL_MODULES = Object.fromEntries(
    Object.keys(MODULE_ENDPOINTS).map((key) => [key, { loading: true, error: '', data: null }])
);

export default function PCloudDashboard() {
    const router = useRouter();
    const [stats, setStats] = useState(null);
    const [modules, setModules] = useState(INITIAL_MODULES);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) {
                router.push('/admin/login');
                return;
            }
        }
        fetchDashboard();
    }, [router]);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const statsRes = await fetch('/api/pcloud/stats');
            const statsData = await statsRes.json();
            if (statsData.success) {
                setStats(statsData);
            }
        } catch {}
        setLoading(false);

        Object.entries(MODULE_ENDPOINTS).forEach(async ([key, url]) => {
            setModules((current) => ({
                ...current,
                [key]: { loading: true, error: '', data: current[key]?.data || null },
            }));

            try {
                const response = await fetch(url);
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to load');
                }
                setModules((current) => ({
                    ...current,
                    [key]: { loading: false, error: '', data },
                }));
            } catch (error) {
                setModules((current) => ({
                    ...current,
                    [key]: { loading: false, error: error.message || 'Failed to load', data: null },
                }));
            }
        });
    };

    const showMsg = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 4000);
    };

    const handleScan = async () => {
        setScanning(true);
        try {
            const res = await fetch('/api/pcloud/scan', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showMsg('success', `Scan complete: ${data.processed} files indexed, ${data.errors} errors`);
                fetchDashboard();
            } else {
                showMsg('error', data.error || 'Scan failed');
            }
        } catch {
            showMsg('error', 'Scan failed');
        }
        setScanning(false);
    };

    const handleSeed = async () => {
        setSeeding(true);
        try {
            const res = await fetch('/api/pcloud/seed', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showMsg('success', data.message || 'Demo data loaded');
                fetchDashboard();
            } else {
                showMsg('error', data.error || 'Seed failed');
            }
        } catch {
            showMsg('error', 'Seed failed');
        }
        setSeeding(false);
    };

    if (loading && !stats) {
        return <div className="loading-page"><div className="spinner"></div></div>;
    }

    const kpis = stats?.kpis || {};
    const recentActivity = stats?.recentActivity || {};

    return (
        <div className="pcloud-page-shell">
            <div className="pcloud-page-header">
                <div className="pcloud-page-title-wrap">
                    <Link href="/admin" className="pcloud-back-link">← Admin</Link>
                    <h1 className="pcloud-page-title">pCloud Business Insights</h1>
                    <p className="pcloud-page-subtitle">
                        Management view of indexed client activity, document trends, folder hotspots, review risk, and operational health.
                    </p>
                </div>
                <div className="admin-header-actions">
                    <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
                        {scanning ? 'Scanning...' : 'Scan P:\\ Drive'}
                    </button>
                    <button className="btn btn-secondary" onClick={handleSeed} disabled={seeding}>
                        {seeding ? 'Seeding...' : 'Load Demo Data'}
                    </button>
                </div>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>
                    {message.text}
                </div>
            )}

            <div className="pcloud-quick-links">
                <Link href="/admin/pcloud/search" className="card pcloud-quick-link-card">
                    <strong>Smart Search</strong>
                    <span>Find files by meaning and Ask pCloud</span>
                </Link>
                <Link href="/admin/pcloud/inventory" className="card pcloud-quick-link-card">
                    <strong>Inventory</strong>
                    <span>Browse all indexed files</span>
                </Link>
                <Link href="/admin/pcloud/review" className="card pcloud-quick-link-card">
                    <strong>Review Queue</strong>
                    <span>{kpis.pendingReviews || 0} pending items</span>
                </Link>
            </div>

            <div className="stats-grid pcloud-kpi-grid">
                <StatCard icon="📁" label="Total Indexed Files" value={kpis.totalFiles || 0} />
                <StatCard icon="🧠" label="Understood Files" value={kpis.understoodFiles || 0} />
                <StatCard icon="👁️" label="Pending Review" value={kpis.pendingReviews || 0} />
                <StatCard icon="⚠️" label="Errors Logged" value={kpis.errorCount || 0} />
                <StatCard icon="🗂️" label="Metadata Only" value={kpis.metadataOnly || 0} />
                <StatCard icon="🧹" label="Ignored System Files" value={kpis.ignoredApprox || 0} />
            </div>

            <div className="pcloud-dashboard-grid">
                <ModuleCard title="Top Active Clients" state={modules.clients} actionHref="/admin/pcloud/search">
                    {(data) => (
                        <div className="pcloud-module-columns">
                            <MetricList title="By file count" items={data.totalByClient} />
                            <MetricList title="Recent 30 days" items={data.recentByClient} />
                            <MetricList title="Understood files" items={data.understoodByClient} />
                        </div>
                    )}
                </ModuleCard>

                <ModuleCard title="File Volume Trends" state={modules.trends}>
                    {(data) => (
                        <div className="pcloud-module-columns pcloud-module-columns-wide">
                            <TrendBars title="Monthly indexing" items={data.monthlyTrend} />
                            <MetricList title="By year" items={data.yearlyDistribution} />
                            <MiniTrend title="Recent activity" items={data.recentIndexingActivity} />
                        </div>
                    )}
                </ModuleCard>

                <ModuleCard title="Document Type Distribution" state={modules.distribution}>
                    {(data) => (
                        <div className="pcloud-module-columns">
                            <MetricList title="Document types" items={data.documentDistribution} />
                            <MetricList title="Understanding quality" items={data.understandingQuality} />
                        </div>
                    )}
                </ModuleCard>

                <ModuleCard title="Folder Activity" state={modules.folders}>
                    {(data) => (
                        <div className="pcloud-module-columns">
                            <MetricList title="Root areas" items={data.rootAreas} />
                            <MetricList title="Top folder prefixes" items={data.folderPrefixes} />
                            <MetricList title="Project areas" items={data.projectAreas} />
                        </div>
                    )}
                </ModuleCard>

                <ModuleCard title="Review Insights" state={modules.review} actionHref="/admin/pcloud/review">
                    {(data) => (
                        <div className="pcloud-module-columns pcloud-module-columns-wide">
                            <MetricList title="Backlog by status" items={data.backlogByStatus} />
                            <MetricList title="Top review reasons" items={data.topReviewReasons} />
                            <MetricList title="Folders with most review items" items={data.foldersWithMostReviewItems} />
                            <TrendBars title="Low-confidence trend" items={data.lowConfidenceTrend} />
                        </div>
                    )}
                </ModuleCard>

                <ModuleCard title="Duplicate / Ignored / Error Insights" state={modules.health}>
                    {(data) => (
                        <div className="pcloud-module-columns pcloud-module-columns-wide">
                            <DuplicateList items={data.duplicateCandidates} />
                            <MetricList title="Ignored system files (approx.)" items={data.ignoredSystemFilesApprox} />
                            <MetricList title="Error types" items={data.errorTypes} />
                            <MetricList title="Extraction failures" items={data.extractionFailuresByType} />
                        </div>
                    )}
                </ModuleCard>
            </div>

            <div className="pcloud-recent-grid">
                <RecentFilesCard items={recentActivity.recentFiles || []} />
                <RecentReviewsCard items={recentActivity.recentReviews || []} />
                <RecentErrorsCard items={recentActivity.recentErrors || []} />
                <RecentJobsCard items={recentActivity.recentJobs || []} />
            </div>
        </div>
    );
}

function StatCard({ icon, label, value }) {
    return (
        <div className="stat-card">
            <div className="stat-card-icon">{icon}</div>
            <div className="stat-card-value">{value}</div>
            <div className="stat-card-label">{label}</div>
        </div>
    );
}

function ModuleCard({ title, state, children, actionHref }) {
    return (
        <section className="card pcloud-insight-card">
            <div className="pcloud-insight-header">
                <h2>{title}</h2>
                {actionHref ? <Link href={actionHref}>Open</Link> : null}
            </div>
            {state.loading ? (
                <div className="pcloud-module-loading"><div className="spinner"></div></div>
            ) : state.error ? (
                <div className="pcloud-module-error">Could not load this module: {state.error}</div>
            ) : (
                children(state.data)
            )}
        </section>
    );
}

function MetricList({ title, items = [] }) {
    const max = Math.max(...items.map((item) => item.value), 1);
    return (
        <div className="pcloud-metric-list">
            <h3>{title}</h3>
            {items.length === 0 ? <p className="pcloud-empty-note">No data available.</p> : items.map((item) => (
                <div key={`${title}-${item.label}`} className="pcloud-metric-row">
                    <div className="pcloud-metric-copy">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                    </div>
                    <div className="pcloud-metric-bar">
                        <div style={{ width: `${Math.max((item.value / max) * 100, 8)}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function TrendBars({ title, items = [] }) {
    const maxVal = Math.max(...items.map((item) => item.value), 1);
    return (
        <div className="pcloud-metric-list">
            <h3>{title}</h3>
            {items.length === 0 ? <p className="pcloud-empty-note">No data available.</p> : (
                <div className="pcloud-trend-bars">
                    {items.map((item) => (
                        <div key={`${title}-${item.label}`} className="pcloud-trend-bar-item">
                            <div className="pcloud-trend-bar-value">{item.value.toLocaleString()}</div>
                            <div className="pcloud-trend-bar-track">
                                <div style={{ height: `${Math.max(Math.round((item.value / maxVal) * 160), 4)}px` }} />
                            </div>
                            <div className="pcloud-trend-bar-label">{item.label}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function MiniTrend({ title, items = [] }) {
    return (
        <div className="pcloud-metric-list">
            <h3>{title}</h3>
            {items.length === 0 ? <p className="pcloud-empty-note">No recent activity.</p> : (
                <div className="pcloud-mini-trend-list">
                    {items.slice(-8).map((item) => (
                        <div key={`${title}-${item.label}`} className="pcloud-mini-trend-item">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function DuplicateList({ items = [] }) {
    return (
        <div className="pcloud-metric-list">
            <h3>Duplicate candidates (heuristic)</h3>
            {items.length === 0 ? <p className="pcloud-empty-note">No duplicate clusters detected.</p> : items.map((item, index) => (
                <div key={`${item.area}-${index}`} className="pcloud-duplicate-card">
                    <div className="pcloud-duplicate-header">
                        <strong>{item.area}</strong>
                        <span>{item.candidateCount} files</span>
                    </div>
                    <div className="pcloud-duplicate-samples">
                        {item.sampleFiles.map((file) => (
                            <div key={file.id}>
                                <span>{file.filename}</span>
                                <small>{file.relativePath}</small>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function RecentFilesCard({ items = [] }) {
    return (
        <section className="card pcloud-insight-card">
            <div className="pcloud-insight-header">
                <h2>Recently Indexed Files</h2>
                <Link href="/admin/pcloud/inventory">Open</Link>
            </div>
            <RecentList
                items={items}
                renderItem={(item) => (
                    <Link href={`/admin/pcloud/files/${item.id}`} className="pcloud-recent-item">
                        <strong>{item.filename}</strong>
                        <span>{item.relative_path}</span>
                        <small>{formatDate(item.indexed_at)}</small>
                    </Link>
                )}
            />
        </section>
    );
}

function RecentReviewsCard({ items = [] }) {
    return (
        <section className="card pcloud-insight-card">
            <div className="pcloud-insight-header">
                <h2>Recent Review Items</h2>
                <Link href="/admin/pcloud/review">Open</Link>
            </div>
            <RecentList
                items={items}
                renderItem={(item) => (
                    <div className="pcloud-recent-item">
                        <strong>{item.filename}</strong>
                        <span>{item.review_reason?.replace(/_/g, ' ')}</span>
                        <small>{item.relative_path || 'Path unavailable'}</small>
                    </div>
                )}
            />
        </section>
    );
}

function RecentErrorsCard({ items = [] }) {
    return (
        <section className="card pcloud-insight-card">
            <div className="pcloud-insight-header">
                <h2>Recent Errors</h2>
            </div>
            <RecentList
                items={items}
                renderItem={(item) => (
                    <div className="pcloud-recent-item">
                        <strong>{item.error_type || 'unknown'}</strong>
                        <span>{item.error_message}</span>
                        <small>{formatDate(item.created_at)}</small>
                    </div>
                )}
            />
        </section>
    );
}

function RecentJobsCard({ items = [] }) {
    return (
        <section className="card pcloud-insight-card">
            <div className="pcloud-insight-header">
                <h2>Recent Jobs</h2>
            </div>
            <RecentList
                items={items}
                renderItem={(item) => (
                    <div className="pcloud-recent-item">
                        <strong>{item.jobType}</strong>
                        <span>{item.processedFiles}/{item.totalFiles} files processed</span>
                        <small>{item.status} • {formatDate(item.startedAt)}</small>
                    </div>
                )}
            />
        </section>
    );
}

function RecentList({ items, renderItem }) {
    if (!items || items.length === 0) {
        return <p className="pcloud-empty-note">No recent activity available.</p>;
    }
    return <div className="pcloud-recent-list">{items.map(renderItem)}</div>;
}

function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}
