'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

export default function PCloudFileDetail() {
    const router = useRouter();
    const params = useParams();
    const fileId = params.id;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) { router.push('/admin/login'); return; }
        }
    }, [router]);

    const fetchFile = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/pcloud/files/${fileId}`);
            const json = await res.json();
            if (json.success) setData(json);
        } catch {}
        setLoading(false);
    }, [fileId]);

    useEffect(() => {
        fetchFile();
    }, [fetchFile]);
    
    const fmtSize = (b) => {
        if (!b) return '—';
        if (b < 1024) return `${b} B`;
        if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
        if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
        return `${(b / 1073741824).toFixed(1)} GB`;
    };

    const fmtDateTime = (d) => d ? new Date(d).toLocaleString() : '—';

    if (loading) return <div className="loading-page"><div className="spinner"></div></div>;
    if (!data || !data.fileRecord) return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
            <Link href="/admin/pcloud/inventory" style={{ color: 'var(--pico-teal)', textDecoration: 'none' }}>← Back to Inventory</Link>
            <div className="card" style={{ padding: '3rem', textAlign: 'center', marginTop: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                <h2>File Not Found</h2>
            </div>
        </div>
    );

    const f = data.fileRecord;
    const u = data.understanding;
    const ec = data.extractedContent;
    const confColor = (c) => c >= 0.7 ? '#10b981' : c >= 0.4 ? '#f59e0b' : '#ef4444';

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <Link href="/admin/pcloud/inventory" style={{ color: 'var(--pico-teal)', textDecoration: 'none', fontSize: '0.85rem' }}>← Inventory</Link>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getFileIcon(f.extension)} {f.filename}
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* File Metadata */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-primary)' }}>📁 File Metadata</h3>
                    <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.85rem' }}>
                        <Row label="Filename" value={f.filename} />
                        <Row label="Extension" value={<span style={{ fontFamily: 'monospace', color: 'var(--pico-teal)', fontWeight: 700 }}>.{f.extension}</span>} />
                        <Row label="MIME Type" value={f.mimeType} />
                        <Row label="Size" value={fmtSize(f.sizeBytes)} />
                        <Row label="Relative Path" value={f.relativePath} mono />
                        {f.absolutePath && <Row label="Absolute Path" value={f.absolutePath} mono />}
                        <Row label="Parent Path" value={f.parentPath || '(root)'} />
                        <Row label="Source" value={f.sourceType} />
                        <Row label="Status" value={f.sourceStatus} />
                        <Row label="Indexed" value={fmtDateTime(f.indexedAt)} />
                        <Row label="Created (source)" value={fmtDateTime(f.createdAtSource)} />
                        <Row label="Modified (source)" value={fmtDateTime(f.updatedAtSource)} />
                        <Row label="Last Seen" value={fmtDateTime(f.lastSeenAt)} />
                    </div>
                </div>

                {/* Understanding */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-primary)' }}>🧠 Understanding</h3>
                    {u ? (
                        <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.85rem' }}>
                            <Row label="Level" value={
                                <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                                    background: u.understandingLevel === 'content_understood' ? 'rgba(16,185,129,0.15)' :
                                        u.understandingLevel === 'filename_path_inferred' ? 'rgba(59,130,246,0.15)' :
                                        u.understandingLevel === 'needs_review' ? 'rgba(239,68,68,0.15)' : 'rgba(107,114,128,0.15)',
                                    color: u.understandingLevel === 'content_understood' ? '#10b981' :
                                        u.understandingLevel === 'filename_path_inferred' ? '#3b82f6' :
                                        u.understandingLevel === 'needs_review' ? '#ef4444' : '#6b7280'
                                }}>{u.understandingLevel?.replace(/_/g, ' ')}</span>
                            } />
                            <Row label="Confidence" value={
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ width: '80px', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                        <div style={{ width: `${u.confidenceScore * 100}%`, height: '100%', borderRadius: '4px', background: confColor(u.confidenceScore) }} />
                                    </div>
                                    <span style={{ fontWeight: 700, color: confColor(u.confidenceScore) }}>{Math.round(u.confidenceScore * 100)}%</span>
                                </div>
                            } />
                            <Row label="Client" value={u.detectedClient || '—'} />
                            <Row label="Project" value={u.detectedProject || '—'} />
                            <Row label="Campaign" value={u.detectedCampaign || '—'} />
                            <Row label="Department" value={u.detectedDepartment || '—'} />
                            <Row label="Document Type" value={u.detectedDocumentType || '—'} />
                            <Row label="Subtype" value={u.detectedDocumentSubtype || '—'} />
                            <Row label="Media Type" value={u.detectedMediaType || '—'} />
                            <Row label="Year" value={u.detectedYear || '—'} />
                            <Row label="Month" value={u.detectedMonth || '—'} />
                            <Row label="Location" value={u.detectedLocation || '—'} />
                            <Row label="Version" value={u.detectedVersion || '—'} />
                            <Row label="Status" value={u.detectedStatus || '—'} />
                            <Row label="Summary" value={u.shortSummary || '—'} />
                            <Row label="Requires Review" value={u.requiresReview ? '⚠️ Yes' : '✅ No'} />
                            {u.confidenceReason && (
                                <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    <strong>Confidence Reason:</strong> {u.confidenceReason}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>No understanding data available.</p>
                    )}
                </div>
            </div>

            {/* Extracted Content */}
            {ec && (
                <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-primary)' }}>📜 Extracted Content</h3>
                    <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        <Row label="Extraction Type" value={ec.extractionType} />
                        <Row label="Status" value={ec.extractionStatus} />
                        {ec.pageCount && <Row label="Pages/Sheets" value={ec.pageCount} />}
                        {ec.extractionNotes && <Row label="Notes" value={ec.extractionNotes} />}
                    </div>
                    {ec.previewText && (
                        <div style={{ padding: '1rem', background: 'var(--bg-glass)', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '300px', overflow: 'auto', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {ec.previewText}
                        </div>
                    )}
                </div>
            )}

            {/* Processing Errors */}
            {data.processingErrors?.length > 0 && (
                <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#ef4444' }}>⚠️ Processing Errors</h3>
                    {data.processingErrors.map((e, i) => (
                        <div key={e.id || i} style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', marginBottom: '0.5rem', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600, color: '#ef4444' }}>{e.error_type}: {e.error_message}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{fmtDateTime(e.created_at)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Row({ label, value, mono }) {
    return (
        <div style={{ display: 'flex', gap: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)', width: '130px', flexShrink: 0, fontWeight: 500 }}>{label}</span>
            <span style={{ color: 'var(--text-primary)', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
}

function getFileIcon(ext) {
    const icons = { pdf: '📕', docx: '📘', doc: '📘', xlsx: '📗', xls: '📗', pptx: '📙', ppt: '📙', txt: '📄', csv: '📊', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', mp3: '🎵', wav: '🎵', m4a: '🎵', mp4: '🎬', mov: '🎬', psd: '🎨', ai: '🎨' };
    return icons[ext] || '📁';
}
