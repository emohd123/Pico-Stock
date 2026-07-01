'use client';
import { useState } from 'react';

export default function CopyLink({ url }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } }}
            title={url}
            style={{ borderRadius: 6, border: '1px solid #cbd5e1', padding: '4px 8px', fontSize: 12, fontWeight: 500, color: '#334155', background: '#fff', cursor: 'pointer' }}
        >
            {copied ? 'Copied!' : 'Copy link'}
        </button>
    );
}
