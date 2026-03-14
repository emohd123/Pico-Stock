'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const LEVELS = [
    { value: '', label: 'All Levels' },
    { value: 'content_understood', label: '🧠 Content Understood' },
    { value: 'filename_path_inferred', label: '📂 Path/Name Inferred' },
    { value: 'metadata_only', label: '📋 Metadata Only' },
    { value: 'needs_review', label: '👁️ Needs Review' },
];

const EXTENSIONS = [
    { value: '', label: 'All Types' },
    { value: 'pdf', label: 'PDF' }, { value: 'docx', label: 'DOCX' },
    { value: 'xlsx', label: 'XLSX' }, { value: 'pptx', label: 'PPTX' },
    { value: 'csv', label: 'CSV' }, { value: 'txt', label: 'TXT' },
    { value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' },
    { value: 'mp3', label: 'MP3' }, { value: 'mp4', label: 'MP4' },
    { value: 'psd', label: 'PSD' }, { value: 'ai', label: 'AI' },
];

export default function PCloudInventory() {
    const router = useRouter();
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [extension, setExtension] = useState('');
    const [level, setLevel] = useState('');
    const [client, setClient] = useState('');
    const [project, setProject] = useState('');
    const [folder, setFolder] = useState('');
    const [offset, setOffset] = useState(0);
    const limit = 50;

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) { router.push('/admin/login'); return; }
        }
    }, [router]);

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (search) params.set('search', search);
            if (extension) params.set('extension', extension);
            if (level) params.set('level', level);
            if (client) params.set('client', client);
            if (project) params.set('project', project);
            if (folder) params.set('folder', folder);

            const res = await fetch(`/api/pcloud/files?${params}`);
            const data = await res.json();
            if (data.success) {
                setRecords(data.records || []);
                setTotal(data.total || 0);
            }
        } catch {}
        setLoading(false);
    }, [offset, search, extension, level, client, project, folder]);

    useEffect(() => { fetchFiles(); }, [fetchFiles]);

    const fmtSize = (b) => {
        if (!b) return '—';
        if (b < 1024) return `${b} B`;
        if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
        if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
        return `${(b / 1073741824).toFixed(1)} GB`;
    };

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

    const confColor = (c) => {
        if (c >= 0.7) return '#10b981';
        if (c >= 0.4) return '#f59e0b';
        return '#ef4444';
    };

    const levelBadge = (l) => {
        const map = {
            content_understood: { label: 'Content', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
            filename_path_inferred: { label: 'Inferred', bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
            metadata_only: { label: 'Metadata', bg: 'rgba(107,114,128,0.15)', color: '#6b7280' },
            needs_review: { label: 'Review', bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
            multimodal_partial: { label: 'Partial', bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
        };
        const s = map[l] || map.metadata_only;
        return <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 600, background: s.bg, color: s.color }}>{s.label}</span>;
    };

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/admin/pcloud" style={{ color: 'var(--pico-teal)', textDecoration: 'none', fontSize: '0.85rem' }}>← pCloud</Link>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>📦 File Inventory</h1>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{total} total files</span>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="form-input" placeholder="Search filename or path..." value={search}
                        onChange={e => { setSearch(e.target.value); setOffset(0); }}
                        style={{ flex: '1 1 200px', minWidth: '180px' }} />
                    <select className="form-input" value={extension}
                        onChange={e => { setExtension(e.target.value); setOffset(0); }}
                        style={{ width: '120px' }}>
                        {EXTENSIONS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                    <select className="form-input" value={level}
                        onChange={e => { setLevel(e.target.value); setOffset(0); }}
                        style={{ width: '180px' }}>
                        {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                    <input className="form-input" placeholder="Client..." value={client}
                        onChange={e => { setClient(e.target.value); setOffset(0); }}
                        style={{ width: '120px' }} />
                    <input className="form-input" placeholder="Project..." value={project}
                        onChange={e => { setProject(e.target.value); setOffset(0); }}
                        style={{ width: '120px' }} />
                    <input className="form-input" placeholder="Folder prefix..." value={folder}
                        onChange={e => { setFolder(e.target.value); setOffset(0); }}
                        style={{ width: '150px' }} title="e.g. Pico Bahrain Projects/2017" />
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner"></div></div>
            ) : records.length === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
                    <p style={{ color: 'var(--text-muted)' }}>No files found. Run a scan or load demo data from the dashboard.</p>
                    <Link href="/admin/pcloud" className="btn btn-primary" style={{ marginTop: '1rem', textDecoration: 'none' }}>← Go to Dashboard</Link>
                </div>
            ) : (
                <>
                    <table className="data-table mobile-stack-table">
                        <thead>
                            <tr>
                                <th>File</th>
                                <th>Type</th>
                                <th>Client</th>
                                <th>Project</th>
                                <th>Understanding</th>
                                <th>Confidence</th>
                                <th>Size</th>
                                <th>Indexed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map(r => (
                                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/admin/pcloud/files/${r.id}`)}>
                                    <td data-label="File">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.85rem' }}>{getFileIcon(r.extension)}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 500, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>{r.filename}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>{r.relativePath}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Type">
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--pico-teal)', fontWeight: 700 }}>.{r.extension}</span>
                                    </td>
                                    <td data-label="Client" style={{ fontSize: '0.85rem' }}>{r.detectedClient || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                    <td data-label="Project" style={{ fontSize: '0.85rem' }}>{r.detectedProject || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                    <td data-label="Understanding">{levelBadge(r.understandingLevel)}</td>
                                    <td data-label="Confidence">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <div style={{ width: '40px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                                <div style={{ width: `${r.confidenceScore * 100}%`, height: '100%', borderRadius: '3px', background: confColor(r.confidenceScore) }} />
                                            </div>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: confColor(r.confidenceScore) }}>{Math.round(r.confidenceScore * 100)}%</span>
                                        </div>
                                    </td>
                                    <td data-label="Size" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{fmtSize(r.sizeBytes)}</td>
                                    <td data-label="Indexed" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{fmtDate(r.indexedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {total > limit && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>← Previous</button>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
                            <button className="btn btn-secondary btn-sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next →</button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function getFileIcon(ext) {
    const icons = { pdf: '📕', docx: '📘', doc: '📘', xlsx: '📗', xls: '📗', pptx: '📙', ppt: '📙', txt: '📄', csv: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', mp3: '🎵', wav: '🎵', m4a: '🎵', mp4: '🎬', mov: '🎬', psd: '🎨', ai: '🎨', zip: '📦', rar: '📦' };
    return icons[ext] || '📁';
}
