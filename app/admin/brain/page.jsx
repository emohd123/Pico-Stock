'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// ─── Example prompts shown in empty chat state ────────────────────────────────
const EXAMPLE_QUESTIONS = [
    'What are our standard chair prices?',
    'Show me all BLINK project files',
    'What was our last event for stc?',
    'List all Tamkeen quotations from last year',
    'What furniture items do we stock under 500 SAR?',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ConfidenceBadge({ confidence }) {
    if (!confidence) return null;
    const map = {
        high: { icon: '🟢', color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'High confidence' },
        medium: { icon: '🟡', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Medium confidence' },
        low: { icon: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Low confidence' },
    };
    const cfg = map[confidence] || map.low;
    return (
        <span style={{
            fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '100px',
            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
        }}>
            {cfg.icon} {cfg.label}
        </span>
    );
}

function SourcesBlock({ sources }) {
    const [open, setOpen] = useState(false);
    if (!sources || sources.length === 0) return null;
    return (
        <div style={{ marginTop: '6px' }}>
            <button
                onClick={() => setOpen((v) => !v)}
                style={{
                    fontSize: '0.72rem', color: '#818cf8', background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: 0,
                }}
            >
                {open ? '▾' : '▸'} {sources.length} source{sources.length !== 1 ? 's' : ''}
            </button>
            {open && (
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {sources.map((src, i) => (
                        <div key={i} style={{
                            fontSize: '0.71rem', color: '#94a3b8', padding: '3px 10px',
                            background: 'rgba(255,255,255,0.04)', borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.06)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={src.filename || src.path || src}>
                            📄 {src.filename || src.path || src}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Pin modal ────────────────────────────────────────────────────────────────
function PinModal({ messageContent, onClose, onPin }) {
    const [title, setTitle] = useState('');
    const [tags, setTags] = useState('');
    const [saving, setSaving] = useState(false);

    const handlePin = async () => {
        if (!title.trim()) return;
        setSaving(true);
        await onPin({ title: title.trim(), tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
        setSaving(false);
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#1e293b', borderRadius: '16px', padding: '28px',
                    width: '420px', maxWidth: '90vw', border: '1px solid rgba(99,102,241,0.3)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)', fontFamily: 'Inter, sans-serif',
                }}
            >
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>
                    📌 Pin this insight
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                    Save this answer to the shared Pinned Insights board.
                </p>

                <div style={{ fontSize: '0.78rem', color: '#94a3b8', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', lineHeight: 1.5, maxHeight: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {messageContent?.slice(0, 200)}{messageContent?.length > 200 ? '…' : ''}
                </div>

                <label style={labelStyle}>Title</label>
                <input
                    style={inputStyle}
                    placeholder="e.g. Chair pricing overview"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                />

                <label style={{ ...labelStyle, marginTop: '12px' }}>Tags (comma-separated)</label>
                <input
                    style={inputStyle}
                    placeholder="e.g. pricing, furniture, chairs"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={btnSecStyle}>Cancel</button>
                    <button
                        onClick={handlePin}
                        disabled={!title.trim() || saving}
                        style={{ ...btnPrimaryStyle, opacity: !title.trim() || saving ? 0.5 : 1, cursor: !title.trim() || saving ? 'not-allowed' : 'pointer' }}
                    >
                        {saving ? 'Pinning…' : '📌 Pin Insight'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Embed modal ──────────────────────────────────────────────────────────────
function EmbedModal({ onClose }) {
    const [stats, setStats] = useState(null);
    const [embedding, setEmbedding] = useState(false);
    const [embedResult, setEmbedResult] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/brain/embed')
            .then((r) => r.json())
            .then((d) => setStats(d.stats || null))
            .catch(() => {});
    }, []);

    const handleEmbed = async () => {
        setEmbedding(true);
        setError('');
        try {
            const res = await fetch('/api/brain/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embedAll: true }),
            });
            const data = await res.json();
            setEmbedResult(data);
            // refresh stats
            const sr = await fetch('/api/brain/embed');
            const sd = await sr.json();
            setStats(sd.stats || null);
        } catch {
            setError('Embedding failed. Please try again.');
        }
        setEmbedding(false);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#1e293b', borderRadius: '16px', padding: '28px',
                    width: '460px', maxWidth: '90vw', border: '1px solid rgba(99,102,241,0.3)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.6)', fontFamily: 'Inter, sans-serif',
                }}
            >
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                    ⚡ Embed Files
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
                    Convert company files into vector embeddings so Pico Brain can search them semantically.
                </p>

                {/* Stats */}
                {stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                        {[
                            { label: 'Total chunks', value: stats.total_chunks ?? '—' },
                            { label: 'Files embedded', value: stats.files_embedded ?? '—' },
                            { label: 'Pending', value: stats.pending ?? '—' },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#818cf8' }}>{value}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>{label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {embedResult && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', fontSize: '0.8rem', color: '#10b981' }}>
                        ✅ Embedded {embedResult.embedded ?? 0} chunks
                        {(embedResult.errors ?? 0) > 0 && ` · ${embedResult.errors} errors`}
                    </div>
                )}

                {error && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '0.8rem', color: '#f87171' }}>
                        ❌ {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={btnSecStyle}>Close</button>
                    <button onClick={handleEmbed} disabled={embedding} style={{ ...btnPrimaryStyle, opacity: embedding ? 0.6 : 1, cursor: embedding ? 'not-allowed' : 'pointer' }}>
                        {embedding ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                                Embedding…
                            </span>
                        ) : '⚡ Embed All Files'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Shared small style tokens ────────────────────────────────────────────────
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' };
const inputStyle = { width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' };
const btnPrimaryStyle = { padding: '9px 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '6px' };
const btnSecStyle = { padding: '9px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif' };

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BrainPage() {
    const router = useRouter();

    // Auth
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin') || sessionStorage.getItem('adminAuth') === 'true';
            if (!isAdmin) router.push('/admin/login');
        }
    }, [router]);

    // State
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [threadsLoading, setThreadsLoading] = useState(true);
    const [pins, setPins] = useState([]);
    const [pinsOpen, setPinsOpen] = useState(true);
    const [showEmbedModal, setShowEmbedModal] = useState(false);
    const [pinModal, setPinModal] = useState(null); // { content, messageId? }
    const [hoveredMsg, setHoveredMsg] = useState(null);
    const [deletingThread, setDeletingThread] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // ── Data fetchers ──────────────────────────────────────────────────────────
    const fetchThreads = useCallback(async () => {
        setThreadsLoading(true);
        try {
            const res = await fetch('/api/brain/threads?userId=admin');
            const data = await res.json();
            setThreads(data.threads || []);
        } catch {}
        setThreadsLoading(false);
    }, []);

    const fetchMessages = useCallback(async (tid) => {
        if (!tid) { setMessages([]); return; }
        try {
            const res = await fetch(`/api/brain/chat?threadId=${tid}`);
            const data = await res.json();
            setMessages(data.messages || data.thread?.messages || []);
        } catch {}
    }, []);

    const fetchPins = useCallback(async () => {
        try {
            const res = await fetch('/api/brain/pin');
            const data = await res.json();
            setPins(data.pins || []);
        } catch {}
    }, []);

    useEffect(() => {
        fetchThreads();
        fetchPins();
    }, [fetchThreads, fetchPins]);

    useEffect(() => {
        if (activeThreadId) fetchMessages(activeThreadId);
    }, [activeThreadId, fetchMessages]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // ── Actions ────────────────────────────────────────────────────────────────
    const createNewThread = async () => {
        try {
            const res = await fetch('/api/brain/threads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'admin' }),
            });
            const data = await res.json();
            const newThread = data.thread;
            if (newThread) {
                setThreads((prev) => [newThread, ...prev]);
                setActiveThreadId(newThread.id);
                setMessages([]);
            }
            return newThread?.id || null;
        } catch {
            return null;
        }
    };

    const handleNewChat = async () => {
        setMessages([]);
        setInput('');
        const tid = await createNewThread();
        if (tid) setActiveThreadId(tid);
    };

    const handleSelectThread = (tid) => {
        setActiveThreadId(tid);
        setInput('');
    };

    const handleDeleteThread = async (e, tid) => {
        e.stopPropagation();
        setDeletingThread(tid);
        try {
            await fetch(`/api/brain/threads/${tid}`, { method: 'DELETE' });
            setThreads((prev) => prev.filter((t) => t.id !== tid));
            if (activeThreadId === tid) {
                setActiveThreadId(null);
                setMessages([]);
            }
        } catch {}
        setDeletingThread(null);
    };

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;

        let tid = activeThreadId;
        if (!tid) {
            tid = await createNewThread();
            if (!tid) return;
        }

        const userMsg = { role: 'user', content: text, id: `u-${Date.now()}` };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/brain/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId: tid, message: text, userId: 'admin' }),
            });
            const data = await res.json();

            if (data.threadId && !activeThreadId) {
                setActiveThreadId(data.threadId);
                // refresh thread list so new thread gets a title
                fetchThreads();
            }

            const assistantMsg = {
                role: 'assistant',
                content: data.answer || 'Sorry, I could not generate a response.',
                sources: data.sources || [],
                confidence: data.confidence || null,
                id: `a-${Date.now()}`,
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'An error occurred. Please try again.', sources: [], confidence: null, id: `err-${Date.now()}` },
            ]);
        }

        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
        }
    };

    const handleExampleClick = (q) => {
        setInput(q);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handlePin = async ({ title, tags }) => {
        if (!pinModal) return;
        try {
            const res = await fetch('/api/brain/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: pinModal.messageId, title, tags, content: pinModal.content }),
            });
            const data = await res.json();
            if (data.pin) {
                setPins((prev) => [data.pin, ...prev]);
            }
        } catch {}
    };

    const handleUnpin = async (id) => {
        try {
            await fetch(`/api/brain/pin?id=${id}`, { method: 'DELETE' });
            setPins((prev) => prev.filter((p) => p.id !== id));
        } catch {}
    };

    // ── Layout style tokens ───────────────────────────────────────────────────
    const pageStyle = {
        display: 'flex', flexDirection: 'column', height: '100vh',
        background: '#0b1120', fontFamily: 'Inter, sans-serif', color: '#e2e8f0', overflow: 'hidden',
    };
    const headerStyle = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '60px', flexShrink: 0,
        background: 'rgba(17,24,39,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(10px)',
    };
    const bodyStyle = {
        flex: 1, display: 'flex', overflow: 'hidden',
    };
    const sidebarStyle = {
        width: '280px', flexShrink: 0,
        background: '#111827', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
    };
    const mainStyle = {
        flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    };
    const chatWindowStyle = {
        flex: 1, overflowY: 'auto', padding: '24px',
        display: 'flex', flexDirection: 'column', gap: '16px',
    };
    const inputAreaStyle = {
        padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(17,24,39,0.8)', flexShrink: 0,
    };
    const pinsAreaStyle = {
        borderTop: '1px solid rgba(255,255,255,0.07)',
        background: '#0d1526', flexShrink: 0,
        maxHeight: pinsOpen ? '220px' : '48px',
        transition: 'max-height 350ms ease',
        overflow: 'hidden',
    };

    const activeThreadStyle = {
        background: 'rgba(99,102,241,0.15)', borderRight: '3px solid #6366f1', color: '#a5b4fc',
    };
    const defaultThreadStyle = {
        background: 'none', borderRight: '3px solid transparent', color: '#94a3b8',
    };

    return (
        <div style={pageStyle}>
            {/* Keyframes */}
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
                @keyframes brainDot { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
                .brain-thread-item:hover { background: rgba(255,255,255,0.05) !important; color: #c7d2fe !important; }
                .brain-thread-item:hover .brain-thread-del { opacity: 1 !important; }
                .brain-input-large:focus { border-color: rgba(99,102,241,0.5) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.1) !important; }
                .brain-msg-row:hover .brain-pin-btn { opacity: 1 !important; }
                .chat-window::-webkit-scrollbar { width: 5px; }
                .chat-window::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.25); border-radius: 3px; }
                .pin-card:hover { border-color: rgba(99,102,241,0.35) !important; background: rgba(99,102,241,0.07) !important; }
            `}</style>

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/admin" style={{ color: '#64748b', fontSize: '0.8rem', textDecoration: 'none' }}>
                        ← Admin
                    </Link>
                    <span style={{ color: '#374151' }}>|</span>
                    <span style={{ fontSize: '16px' }}>🧠</span>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#e2e8f0', letterSpacing: '-0.01em' }}>
                        PICO BRAIN
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '100px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Company Intelligence
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={() => setShowEmbedModal(true)}
                        style={{ ...btnSecStyle, fontSize: '0.8rem', padding: '8px 16px' }}
                    >
                        ⚡ Embed Files
                    </button>
                </div>
            </header>

            {/* ── Body ───────────────────────────────────────────────────────── */}
            <div style={bodyStyle}>
                {/* Sidebar */}
                <aside style={sidebarStyle}>
                    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                        <button
                            onClick={handleNewChat}
                            style={{ ...btnPrimaryStyle, width: '100%', justifyContent: 'center', padding: '10px' }}
                        >
                            + New Chat
                        </button>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
                        {threadsLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                                <div style={{ width: '20px', height: '20px', border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            </div>
                        ) : threads.length === 0 ? (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#4b5563', fontSize: '0.8rem' }}>
                                No conversations yet.<br />Start a new chat!
                            </div>
                        ) : (
                            threads.map((thread) => {
                                const isActive = thread.id === activeThreadId;
                                return (
                                    <div
                                        key={thread.id}
                                        className="brain-thread-item"
                                        onClick={() => handleSelectThread(thread.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 16px', cursor: 'pointer', transition: 'all 150ms ease',
                                            borderRight: '3px solid transparent',
                                            ...(isActive ? activeThreadStyle : defaultThreadStyle),
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.83rem', fontWeight: isActive ? 600 : 400, color: isActive ? '#c7d2fe' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {thread.title || 'Untitled conversation'}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#4b5563', marginTop: '2px' }}>
                                                {formatTime(thread.updatedAt || thread.createdAt)}
                                            </div>
                                        </div>
                                        <button
                                            className="brain-thread-del"
                                            onClick={(e) => handleDeleteThread(e, thread.id)}
                                            disabled={deletingThread === thread.id}
                                            style={{
                                                opacity: 0, transition: 'opacity 150ms ease',
                                                background: 'none', border: 'none', color: '#ef4444',
                                                cursor: 'pointer', padding: '4px', fontSize: '13px',
                                                borderRadius: '4px', flexShrink: 0, marginLeft: '6px',
                                            }}
                                            title="Delete thread"
                                            aria-label="Delete thread"
                                        >
                                            {deletingThread === thread.id ? '…' : '🗑'}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </aside>

                {/* Main chat area */}
                <main style={mainStyle}>
                    {/* Chat window */}
                    <div className="chat-window" style={chatWindowStyle}>
                        {messages.length === 0 && !loading ? (
                            /* Empty state */
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '16px', animation: 'fadeUp 0.4s ease' }}>
                                <div style={{ fontSize: '48px', marginBottom: '4px' }}>🧠</div>
                                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c7d2fe', letterSpacing: '-0.02em' }}>
                                    Start a new conversation
                                </h2>
                                <p style={{ color: '#4b5563', fontSize: '0.875rem', maxWidth: '360px', lineHeight: 1.6 }}>
                                    Ask Pico Brain anything about your company files, clients, products, or projects.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '400px', marginTop: '8px' }}>
                                    {EXAMPLE_QUESTIONS.map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => handleExampleClick(q)}
                                            style={{
                                                padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.2)',
                                                background: 'rgba(99,102,241,0.07)', color: '#94a3b8', cursor: 'pointer',
                                                fontSize: '0.82rem', textAlign: 'left', fontFamily: 'Inter, sans-serif',
                                                transition: 'all 150ms ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.14)'; e.currentTarget.style.color = '#c7d2fe'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.35)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'; }}
                                        >
                                            ✦ {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, i) => {
                                const isUser = msg.role === 'user';
                                return (
                                    <div
                                        key={msg.id || i}
                                        className="brain-msg-row"
                                        style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: '10px', alignItems: 'flex-end', animation: 'fadeUp 0.25s ease', position: 'relative' }}
                                        onMouseEnter={() => setHoveredMsg(i)}
                                        onMouseLeave={() => setHoveredMsg(null)}
                                    >
                                        {/* Assistant avatar */}
                                        {!isUser && (
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, marginBottom: '2px' }}>
                                                🧠
                                            </div>
                                        )}

                                        <div style={{ maxWidth: '68%' }}>
                                            {/* Bubble */}
                                            <div style={{
                                                padding: '12px 16px',
                                                borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                                                background: isUser
                                                    ? 'linear-gradient(135deg,#4f46e5,#7c3aed)'
                                                    : 'rgba(255,255,255,0.05)',
                                                color: isUser ? '#fff' : '#e2e8f0',
                                                fontSize: '0.875rem',
                                                lineHeight: 1.6,
                                                border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                            }}>
                                                {msg.content}
                                            </div>

                                            {/* Assistant extras */}
                                            {!isUser && (
                                                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: '4px' }}>
                                                    <ConfidenceBadge confidence={msg.confidence} />
                                                    <SourcesBlock sources={msg.sources} />
                                                    {/* Pin button */}
                                                    <button
                                                        className="brain-pin-btn"
                                                        onClick={() => setPinModal({ content: msg.content, messageId: msg.id })}
                                                        style={{
                                                            opacity: hoveredMsg === i ? 1 : 0,
                                                            transition: 'opacity 150ms ease',
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            fontSize: '14px', padding: '2px 4px',
                                                            borderRadius: '4px', color: '#818cf8',
                                                        }}
                                                        title="Pin this insight"
                                                    >
                                                        📌
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {/* Loading indicator */}
                        {loading && (
                            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '10px', alignItems: 'flex-end', animation: 'fadeUp 0.2s ease' }}>
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                                    🧠
                                </div>
                                <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px 16px 16px 2px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                    {[0, 200, 400].map((delay) => (
                                        <div key={delay} style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#6366f1', animation: `brainDot 1.2s ${delay}ms infinite` }} />
                                    ))}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input area */}
                    <div style={inputAreaStyle}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <textarea
                                ref={inputRef}
                                className="brain-input-large"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                                placeholder="Ask Pico Brain anything… (Ctrl+Enter to send)"
                                rows={2}
                                style={{
                                    flex: 1, padding: '12px 16px', borderRadius: '12px',
                                    border: '1px solid rgba(99,102,241,0.25)',
                                    background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                                    fontSize: '0.875rem', fontFamily: 'Inter, sans-serif',
                                    outline: 'none', resize: 'none', lineHeight: 1.5,
                                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                                }}
                            />
                            <button
                                onClick={send}
                                disabled={!input.trim() || loading}
                                style={{
                                    ...btnPrimaryStyle,
                                    padding: '12px 20px',
                                    opacity: (!input.trim() || loading) ? 0.5 : 1,
                                    cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                                    alignSelf: 'flex-end',
                                }}
                            >
                                {loading ? (
                                    <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                                ) : 'Send ➤'}
                            </button>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#374151', textAlign: 'right' }}>
                            Ctrl+Enter to send · Shift+Enter for new line
                        </div>
                    </div>

                    {/* Pinned Insights */}
                    <div style={pinsAreaStyle}>
                        {/* Toggle header */}
                        <div
                            onClick={() => setPinsOpen((v) => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '12px 24px', cursor: 'pointer', userSelect: 'none',
                                borderBottom: pinsOpen ? '1px solid rgba(255,255,255,0.06)' : 'none',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span>📌</span>
                                <span>Pinned Insights</span>
                                {pins.length > 0 && (
                                    <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: '100px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                                        {pins.length}
                                    </span>
                                )}
                            </div>
                            <span style={{ color: '#4b5563', fontSize: '12px' }}>{pinsOpen ? '▾' : '▸'}</span>
                        </div>

                        {/* Pin cards grid */}
                        {pinsOpen && (
                            <div style={{ overflowX: 'auto', overflowY: 'hidden', padding: '12px 24px 16px' }}>
                                {pins.length === 0 ? (
                                    <div style={{ color: '#374151', fontSize: '0.8rem', textAlign: 'center', padding: '8px 0' }}>
                                        No pinned insights yet. Hover an assistant message and click 📌 to pin it.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        {pins.map((pin) => (
                                            <div
                                                key={pin.id}
                                                className="pin-card"
                                                style={{
                                                    minWidth: '220px', maxWidth: '260px', padding: '12px 14px',
                                                    background: 'rgba(99,102,241,0.05)',
                                                    border: '1px solid rgba(99,102,241,0.18)',
                                                    borderRadius: '10px', flexShrink: 0,
                                                    transition: 'all 150ms ease',
                                                }}
                                            >
                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#c7d2fe', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {pin.title}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '8px' }}>
                                                    {pin.content || pin.preview || '—'}
                                                </div>
                                                {pin.tags && pin.tags.length > 0 && (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                        {pin.tags.map((tag) => (
                                                            <span key={tag} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '100px', background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => handleUnpin(pin.id)}
                                                    style={{ fontSize: '0.7rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', padding: 0 }}
                                                >
                                                    Unpin
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* Modals */}
            {showEmbedModal && <EmbedModal onClose={() => setShowEmbedModal(false)} />}
            {pinModal && (
                <PinModal
                    messageContent={pinModal.content}
                    onClose={() => setPinModal(null)}
                    onPin={handlePin}
                />
            )}
        </div>
    );
}
