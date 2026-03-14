'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function PCloudReview() {
    const router = useRouter();
    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [folder, setFolder] = useState('');
    const [processing, setProcessing] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [editLabels, setEditLabels] = useState({ client: '', project: '', documentType: '' });
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) { router.push('/admin/login'); return; }
        }
    }, [router]);

    const fetchReviews = useCallback(async () => {
        setLoading(true);
        try {
            const f = folder ? '&folder=' + encodeURIComponent(folder) : '';
            const res = await fetch(`/api/pcloud/review?status=${statusFilter}${f}`);
            const data = await res.json();
            if (data.success) {
                setItems(data.items || []);
                setTotal(data.total || 0);
            }
        } catch {}
        setLoading(false);
    }, [folder, statusFilter]);

    useEffect(() => { fetchReviews(); }, [fetchReviews]);

    const showMsg = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    };

    const handleAction = async (id, action, labels) => {
        setProcessing(p => ({ ...p, [id]: true }));
        try {
            const res = await fetch('/api/pcloud/review', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action, labels }),
            });
            const data = await res.json();
            if (data.success) {
                showMsg('success', `✅ File ${action === 'approve' ? 'approved' : action === 'edit' ? 'labels updated' : action === 'defer' ? 'deferred' : 'marked unknown'}`);
                setEditingId(null);
                fetchReviews();
            } else {
                showMsg('error', data.error);
            }
        } catch { showMsg('error', 'Action failed'); }
        setProcessing(p => ({ ...p, [id]: false }));
    };

    const openEdit = (item) => {
        setEditingId(item.id);
        setEditLabels({
            client: item.suggestedLabels?.client || '',
            project: item.suggestedLabels?.project || '',
            documentType: item.suggestedLabels?.documentType || '',
        });
    };

    const confColor = (c) => c >= 0.7 ? '#10b981' : c >= 0.4 ? '#f59e0b' : '#ef4444';

    if (loading) return <div className="loading-page"><div className="spinner"></div></div>;

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/admin/pcloud" style={{ color: 'var(--pico-teal)', textDecoration: 'none', fontSize: '0.85rem' }}>← pCloud</Link>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>🔍 Review Queue</h1>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input className="form-input" placeholder="Folder prefix..." value={folder}
                        onChange={e => setFolder(e.target.value)}
                        style={{ width: '200px' }} title="e.g. Pico Bahrain Projects/2017" />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['pending', 'approved', 'deferred', 'all'].map(s => (
                            <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setStatusFilter(s)} style={{ textTransform: 'capitalize' }}>
                                {s} {s === 'pending' && total > 0 ? `(${total})` : ''}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {message.text && (
                <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
            )}

            {items.length === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
                    <h3 style={{ color: 'var(--text-primary)' }}>No items to review</h3>
                    <p style={{ color: 'var(--text-muted)' }}>{statusFilter === 'pending' ? 'All files have been reviewed!' : `No ${statusFilter} items.`}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {items.map(item => (
                        <div key={item.id} className="card" style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '250px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                        <span style={{ fontSize: '0.9rem' }}>{getFileIcon(item.extension)}</span>
                                        <Link href={`/admin/pcloud/files/${item.fileRecordId}`} style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', fontSize: '0.95rem' }}>
                                            {item.filename}
                                        </Link>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
                                        {item.relativePath}
                                    </div>

                                    {/* Suggested Labels */}
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                                        {item.suggestedLabels?.client && (
                                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>👤 {item.suggestedLabels.client}</span>
                                        )}
                                        {item.suggestedLabels?.project && (
                                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>📂 {item.suggestedLabels.project}</span>
                                        )}
                                        {item.suggestedLabels?.documentType && (
                                            <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(0,165,165,0.15)', color: '#00A5A5' }}>📄 {item.suggestedLabels.documentType}</span>
                                        )}
                                    </div>

                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        Reason: <strong>{item.reviewReason?.replace(/_/g, ' ')}</strong>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    {/* Confidence */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                                        <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                            <div style={{ width: `${item.confidenceScore * 100}%`, height: '100%', borderRadius: '3px', background: confColor(item.confidenceScore) }} />
                                        </div>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: confColor(item.confidenceScore) }}>{Math.round(item.confidenceScore * 100)}%</span>
                                    </div>

                                    {/* Actions */}
                                    {item.status === 'pending' && (
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                            <button className="btn btn-primary btn-sm" disabled={processing[item.id]} onClick={() => handleAction(item.id, 'approve')}>
                                                ✅ Approve
                                            </button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)}>
                                                ✏️ Edit
                                            </button>
                                            <button className="btn btn-sm" style={{ background: 'rgba(107,114,128,0.15)', color: '#6b7280', border: '1px solid rgba(107,114,128,0.3)' }}
                                                onClick={() => handleAction(item.id, 'unknown')}>
                                                ❓ Unknown
                                            </button>
                                            <button className="btn btn-sm" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                                                onClick={() => handleAction(item.id, 'defer')}>
                                                ⏸️ Defer
                                            </button>
                                        </div>
                                    )}
                                    {item.status !== 'pending' && (
                                        <span style={{ padding: '3px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                            background: item.status === 'approved' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                            color: item.status === 'approved' ? '#10b981' : '#f59e0b'
                                        }}>{item.status}</span>
                                    )}
                                </div>
                            </div>

                            {/* Edit modal / inline */}
                            {editingId === item.id && (
                                <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-glass)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Edit Labels</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Client</label>
                                            <input className="form-input" value={editLabels.client} onChange={e => setEditLabels(l => ({ ...l, client: e.target.value }))} placeholder="Client name" />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Project</label>
                                            <input className="form-input" value={editLabels.project} onChange={e => setEditLabels(l => ({ ...l, project: e.target.value }))} placeholder="Project name" />
                                        </div>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Document Type</label>
                                            <input className="form-input" value={editLabels.documentType} onChange={e => setEditLabels(l => ({ ...l, documentType: e.target.value }))} placeholder="e.g. quotation" />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                        <button className="btn btn-primary btn-sm" onClick={() => handleAction(item.id, 'edit', editLabels)}>Save Labels</button>
                                        <button className="btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function getFileIcon(ext) {
    const icons = { pdf: '📕', docx: '📘', doc: '📘', xlsx: '📗', xls: '📗', pptx: '📙', ppt: '📙', txt: '📄', csv: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', mp3: '🎵', wav: '🎵', m4a: '🎵', mp4: '🎬', mov: '🎬', psd: '🎨', ai: '🎨' };
    return icons[ext] || '📁';
}
