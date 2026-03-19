'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const PLACEHOLDER = "Ask anything about Pico's files, clients, products...";

const S = {
    /* floating trigger button */
    trigger: {
        position: 'fixed',
        bottom: '28px',
        right: '28px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        padding: 0,
        fontFamily: 'Inter, sans-serif',
    },
    triggerCircle: {
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 4px 20px rgba(99,102,241,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        color: '#fff',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
    },
    triggerLabel: {
        fontSize: '10px',
        fontWeight: 700,
        color: '#a5b4fc',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },

    /* panel wrapper */
    panel: {
        position: 'fixed',
        bottom: '100px',
        right: '28px',
        zIndex: 9998,
        width: '400px',
        height: '500px',
        borderRadius: '16px',
        background: '#0f172a',
        border: '1px solid rgba(99,102,241,0.25)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
        animation: 'brainPanelIn 200ms ease',
    },

    /* panel header */
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        flexShrink: 0,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    headerTitle: {
        fontSize: '0.9rem',
        fontWeight: 700,
        color: '#e2e8f0',
        letterSpacing: '-0.01em',
    },
    headerBadge: {
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 7px',
        borderRadius: '100px',
        background: 'rgba(99,102,241,0.25)',
        color: '#a5b4fc',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    openFullLink: {
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#a5b4fc',
        textDecoration: 'none',
        padding: '4px 10px',
        borderRadius: '6px',
        background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.25)',
        transition: 'background 150ms ease',
        whiteSpace: 'nowrap',
    },
    closeBtn: {
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: 'rgba(255,255,255,0.06)',
        color: '#94a3b8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        transition: 'background 150ms ease',
    },

    /* messages area */
    messages: {
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    emptyState: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '8px',
        color: '#64748b',
    },
    emptyIcon: {
        fontSize: '32px',
        marginBottom: '4px',
    },
    emptyTitle: {
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#94a3b8',
    },
    emptyHint: {
        fontSize: '0.75rem',
        color: '#64748b',
        lineHeight: 1.5,
        maxWidth: '260px',
    },

    /* individual messages */
    msgRow: (role) => ({
        display: 'flex',
        justifyContent: role === 'user' ? 'flex-end' : 'flex-start',
        gap: '8px',
        alignItems: 'flex-end',
    }),
    bubble: (role) => ({
        maxWidth: '82%',
        padding: '9px 13px',
        borderRadius: role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
        background: role === 'user'
            ? 'linear-gradient(135deg, #4f46e5, #7c3aed)'
            : 'rgba(255,255,255,0.06)',
        color: role === 'user' ? '#fff' : '#e2e8f0',
        fontSize: '0.82rem',
        lineHeight: 1.55,
        border: role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
    }),
    assistantIcon: {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        flexShrink: 0,
        marginBottom: '2px',
    },

    /* loading dots */
    loadingDots: {
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '14px 14px 14px 2px',
        border: '1px solid rgba(255,255,255,0.08)',
    },
    dot: (delay) => ({
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#6366f1',
        animation: `brainDot 1.2s ${delay}ms infinite`,
    }),

    /* sources */
    sourcesToggle: {
        marginTop: '4px',
        fontSize: '0.7rem',
        color: '#7c3aed',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'Inter, sans-serif',
    },
    sourcesList: {
        marginTop: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    sourceItem: {
        fontSize: '0.7rem',
        color: '#94a3b8',
        padding: '3px 8px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '4px',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },

    /* input row */
    inputRow: {
        display: 'flex',
        gap: '8px',
        padding: '12px 14px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.2)',
        flexShrink: 0,
    },
    input: {
        flex: 1,
        padding: '9px 13px',
        borderRadius: '10px',
        border: '1px solid rgba(99,102,241,0.25)',
        background: 'rgba(255,255,255,0.05)',
        color: '#e2e8f0',
        fontSize: '0.82rem',
        fontFamily: 'Inter, sans-serif',
        outline: 'none',
        resize: 'none',
        lineHeight: 1.4,
        minHeight: '38px',
        maxHeight: '100px',
    },
    sendBtn: (disabled) => ({
        padding: '9px 14px',
        borderRadius: '10px',
        border: 'none',
        background: disabled ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        color: disabled ? '#64748b' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        flexShrink: 0,
        transition: 'opacity 150ms ease',
        alignSelf: 'flex-end',
    }),
};

function SourcesBlock({ sources }) {
    const [open, setOpen] = useState(false);
    if (!sources || sources.length === 0) return null;
    return (
        <div>
            <button style={S.sourcesToggle} onClick={() => setOpen((v) => !v)}>
                {open ? '▾' : '▸'} {sources.length} source{sources.length !== 1 ? 's' : ''}
            </button>
            {open && (
                <div style={S.sourcesList}>
                    {sources.map((src, i) => (
                        <div key={i} style={S.sourceItem} title={src.filename || src}>
                            {src.filename || src.path || src}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ConfidenceBadge({ confidence }) {
    if (!confidence) return null;
    const map = { high: ['🟢', '#10b981'], medium: ['🟡', '#f59e0b'], low: ['🔴', '#ef4444'] };
    const [icon, color] = map[confidence] || map.low;
    return (
        <span style={{ fontSize: '0.65rem', color, fontWeight: 600, marginLeft: '4px' }}>
            {icon} {confidence}
        </span>
    );
}

export default function ChatBubble() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [threadId, setThreadId] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (open && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, loading, open]);

    // Focus input when panel opens
    useEffect(() => {
        if (open && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;

        const userMsg = { role: 'user', content: text };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/brain/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId, message: text, userId: 'admin' }),
            });
            const data = await res.json();

            if (data.threadId && !threadId) {
                setThreadId(data.threadId);
            }

            const assistantMsg = {
                role: 'assistant',
                content: data.answer || 'Sorry, I could not generate a response.',
                sources: data.sources || [],
                confidence: data.confidence || null,
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'An error occurred. Please try again.', sources: [], confidence: null },
            ]);
        }

        setLoading(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    };

    const handleToggle = () => {
        setOpen((v) => !v);
    };

    return (
        <>
            {/* Inline keyframes injected once */}
            <style>{`
                @keyframes brainPanelIn {
                    from { opacity: 0; transform: translateY(12px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes brainDot {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                    40%           { transform: scale(1);   opacity: 1; }
                }
                .brain-trigger-circle:hover {
                    transform: scale(1.08) !important;
                    box-shadow: 0 6px 28px rgba(99,102,241,0.6) !important;
                }
                .brain-open-full:hover {
                    background: rgba(99,102,241,0.28) !important;
                }
                .brain-close-btn:hover {
                    background: rgba(255,255,255,0.12) !important;
                }
                .brain-input:focus {
                    border-color: rgba(99,102,241,0.5) !important;
                    box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
                }
                .brain-msgs::-webkit-scrollbar { width: 4px; }
                .brain-msgs::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }
            `}</style>

            {/* Floating trigger */}
            <button
                onClick={handleToggle}
                style={S.trigger}
                title={open ? 'Close Pico Brain' : 'Open Pico Brain'}
                aria-label="Toggle Pico Brain chat"
            >
                <span className="brain-trigger-circle" style={S.triggerCircle}>
                    {open ? '✕' : '🧠'}
                </span>
                <span style={S.triggerLabel}>Brain</span>
            </button>

            {/* Chat panel */}
            {open && (
                <div style={S.panel} role="dialog" aria-label="Pico Brain chat panel">
                    {/* Header */}
                    <div style={S.header}>
                        <div style={S.headerLeft}>
                            <span style={{ fontSize: '16px' }}>🧠</span>
                            <span style={S.headerTitle}>Pico Brain</span>
                            <span style={S.headerBadge}>AI</span>
                        </div>
                        <div style={S.headerActions}>
                            <Link
                                href="/admin/brain"
                                className="brain-open-full"
                                style={S.openFullLink}
                                title="Open full Brain page"
                            >
                                Open Full ↗
                            </Link>
                            <button
                                className="brain-close-btn"
                                style={S.closeBtn}
                                onClick={() => setOpen(false)}
                                aria-label="Close panel"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="brain-msgs" style={S.messages}>
                        {messages.length === 0 && !loading ? (
                            <div style={S.emptyState}>
                                <div style={S.emptyIcon}>✨</div>
                                <div style={S.emptyTitle}>Ask Pico Brain</div>
                                <div style={S.emptyHint}>
                                    Ask anything about files, clients, products, pricing, or company knowledge.
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <div key={i}>
                                    <div style={S.msgRow(msg.role)}>
                                        {msg.role === 'assistant' && (
                                            <div style={S.assistantIcon}>🧠</div>
                                        )}
                                        <div>
                                            <div style={S.bubble(msg.role)}>{msg.content}</div>
                                            {msg.role === 'assistant' && (
                                                <div style={{ marginTop: '4px', marginLeft: '2px' }}>
                                                    <ConfidenceBadge confidence={msg.confidence} />
                                                    <SourcesBlock sources={msg.sources} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Loading state */}
                        {loading && (
                            <div style={S.msgRow('assistant')}>
                                <div style={S.assistantIcon}>🧠</div>
                                <div style={S.loadingDots}>
                                    <div style={S.dot(0)} />
                                    <div style={S.dot(200)} />
                                    <div style={S.dot(400)} />
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div style={S.inputRow}>
                        <textarea
                            ref={inputRef}
                            className="brain-input"
                            style={S.input}
                            placeholder={PLACEHOLDER}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={loading}
                            rows={1}
                        />
                        <button
                            style={S.sendBtn(!input.trim() || loading)}
                            onClick={send}
                            disabled={!input.trim() || loading}
                            aria-label="Send message"
                        >
                            ➤
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
