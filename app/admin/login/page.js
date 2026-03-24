'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();

            if (data.success) {
                router.push('/admin');
                router.refresh();
            } else {
                setError('Invalid password. Please try again.');
            }
        } catch {
            setError('Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-enter login-page">
            <div className="login-card">
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
                <h2>Admin Access</h2>
                <p>Enter the admin password to manage products and orders.</p>

                {error && (
                    <div className="alert alert-error">⚠️ {error}</div>
                )}

                <form onSubmit={handleLogin}>
                    <div className="form-group" style={{ textAlign: 'left' }}>
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Enter admin password"
                            autoComplete="current-password"
                            autoFocus
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={loading}
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
