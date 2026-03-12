'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const COLORS = ['#00A5A5', '#3b82f6', '#8b5cf6', '#f97316', '#10b981', '#f59e0b', '#ec4899'];

const STATUS_CONFIG = {
    'pending':     { label: 'Pending',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    'in-progress': { label: 'In Progress', color: '#00A5A5', bg: 'rgba(0,165,165,0.12)' },
    'review':      { label: 'In Review',   color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    'completed':   { label: 'Completed',   color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtDate = (str) => {
    if (!str) return '—';
    const [y, m, d] = str.split('-');
    return `${d} ${MONTH_NAMES[parseInt(m,10)-1]?.slice(0,3)} ${y}`;
};

export default function DesignersPage() {
    const router = useRouter();
    const [designers, setDesigners] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [calMonth, setCalMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Modals
    const [addDesignerOpen, setAddDesignerOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [projectModalOpen, setProjectModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [projectForm, setProjectForm] = useState({ name: '', startDate: '', deadline: '', status: 'in-progress', notes: '' });
    const [projectError, setProjectError] = useState('');

    const TODAY = todayStr();

    // Auth check
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) { router.push('/admin/login'); return; }
        }
        fetch('/api/designers')
            .then(r => r.json())
            .then(data => {
                const list = Array.isArray(data) ? data : [];
                setDesigners(list);
                if (list.length > 0) setSelectedId(list[0].id);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [router]);

    const selected = designers.find(d => d.id === selectedId);

    // Reset calendar to current month and select designer
    function selectDesigner(id) {
        setSelectedId(id);
        setCalMonth({ year: new Date().getFullYear(), month: new Date().getMonth() });
    }

    // ── CRUD ─────────────────────────────────────────────────────────────────
    async function addDesigner() {
        if (!newName.trim()) return;
        setSaving(true);
        const res = await fetch('/api/designers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() }),
        });
        const data = await res.json();
        if (data.designer) {
            setDesigners(prev => [...prev, data.designer]);
            selectDesigner(data.designer.id);
            setNewName('');
            setAddDesignerOpen(false);
        }
        setSaving(false);
    }

    async function removeDesigner(id) {
        if (!confirm('Delete this designer and all their projects?')) return;
        await fetch(`/api/designers?id=${id}`, { method: 'DELETE' });
        const remaining = designers.filter(d => d.id !== id);
        setDesigners(remaining);
        selectDesigner(remaining[0]?.id || null);
    }

    function openAddProject() {
        setEditingProject(null);
        setProjectForm({ name: '', startDate: TODAY, deadline: '', status: 'in-progress', notes: '' });
        setProjectError('');
        setProjectModalOpen(true);
    }

    function openEditProject(p) {
        setEditingProject(p);
        setProjectForm({ name: p.name, startDate: p.startDate, deadline: p.deadline, status: p.status, notes: p.notes || '' });
        setProjectError('');
        setProjectModalOpen(true);
    }

    async function saveProject() {
        if (!projectForm.name || !projectForm.startDate || !projectForm.deadline) return;
        if (projectForm.deadline < projectForm.startDate) {
            setProjectError('Deadline cannot be before the start date.');
            return;
        }
        setProjectError('');
        setSaving(true);
        const current = selected?.projects || [];
        const updated = editingProject
            ? current.map(p => p.id === editingProject.id ? { ...p, ...projectForm } : p)
            : [...current, { id: `proj-${Date.now()}`, ...projectForm }];
        const res = await fetch('/api/designers', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedId, projects: updated }),
        });
        const data = await res.json();
        if (data.designer) setDesigners(prev => prev.map(d => d.id === selectedId ? data.designer : d));
        setProjectModalOpen(false);
        setSaving(false);
    }

    async function deleteProject(projId) {
        if (!confirm('Remove this project?')) return;
        const updated = (selected?.projects || []).filter(p => p.id !== projId);
        const res = await fetch('/api/designers', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: selectedId, projects: updated }),
        });
        const data = await res.json();
        if (data.designer) setDesigners(prev => prev.map(d => d.id === selectedId ? data.designer : d));
    }

    // ── CALENDAR ─────────────────────────────────────────────────────────────
    function calDays() {
        const { year, month } = calMonth;
        const firstWday = new Date(year, month, 1).getDay();
        const total = new Date(year, month + 1, 0).getDate();
        const days = Array(firstWday).fill(null);
        for (let d = 1; d <= total; d++) days.push(d);
        return days;
    }

    function dayStr(d) {
        if (!d) return '';
        return `${calMonth.year}-${String(calMonth.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }

    // Returns projects from ALL designers active on this day, each tagged with designer color + name
    function projectsOnDay(d) {
        const ds = dayStr(d);
        if (!ds) return [];
        const result = [];
        designers.forEach((designer, dIdx) => {
            (designer.projects || []).forEach(p => {
                if (p.startDate <= ds && p.deadline >= ds) {
                    result.push({ ...p, _color: COLORS[dIdx % COLORS.length], _designerName: designer.name });
                }
            });
        });
        return result;
    }

    // Returns true if ANY designer has a deadline on this day
    function isDeadlineDay(ds) {
        return designers.some(d => (d.projects || []).some(p => p.deadline === ds));
    }

    function prevMonth() {
        setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
    }
    function nextMonth() {
        setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function activeProjects(designer) {
        return (designer.projects || []).filter(p => p.status !== 'completed');
    }

    function nextDeadline(designer) {
        return (designer.projects || [])
            .filter(p => p.status !== 'completed' && p.deadline >= TODAY)
            .sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    }

    function isOverdue(p) {
        return p.deadline < TODAY && p.status !== 'completed';
    }

    const days = calDays();

    if (loading) return <div className="loading-page"><div className="spinner"></div></div>;

    return (
        <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-primary)' }}>

            {/* ── Page Header ─────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/admin" style={{ color: 'var(--pico-teal)', textDecoration: 'none', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ← Admin
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        🎨 Designers Board
                    </h1>
                </div>
                <button className="btn btn-primary" onClick={() => setAddDesignerOpen(true)}>
                    + Add Designer
                </button>
            </div>

            {/* ── Layout ──────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>

                {/* Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {designers.length === 0 ? (
                        <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤</div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
                                No designers yet.<br />Add your first designer.
                            </p>
                        </div>
                    ) : (
                        designers.map((designer, dIdx) => {
                            const active = activeProjects(designer).length;
                            const nd = nextDeadline(designer);
                            const isSelected = designer.id === selectedId;
                            const designerColor = COLORS[dIdx % COLORS.length];
                            return (
                                <div
                                    key={designer.id}
                                    className="card"
                                    style={{
                                        padding: '0.9rem 1rem', cursor: 'pointer',
                                        borderColor: isSelected ? designerColor : undefined,
                                        background: isSelected ? `${designerColor}18` : undefined,
                                        transition: 'all 0.2s',
                                    }}
                                    onClick={() => selectDesigner(designer.id)}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '0.2rem' }}>
                                                {/* colour swatch matching calendar bar */}
                                                <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: designerColor, flexShrink: 0 }} />
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? designerColor : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {designer.name}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                {active} active project{active !== 1 ? 's' : ''}
                                            </div>
                                            {nd && (
                                                <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '0.2rem' }}>
                                                    ⏰ Due {fmtDate(nd.deadline)}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={e => { e.stopPropagation(); removeDesigner(designer.id); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.75rem', padding: '2px', flexShrink: 0 }}
                                            title="Delete designer"
                                        >🗑</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Main panel */}
                {selected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                        {/* Designer header bar */}
                        <div className="card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{selected.name}</h2>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    {(selected.projects || []).length} project{(selected.projects || []).length !== 1 ? 's' : ''} total
                                    &nbsp;·&nbsp;
                                    {activeProjects(selected).length} active
                                </span>
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={openAddProject}>+ Add Project</button>
                        </div>

                        {/* Calendar */}
                        <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                            {/* Month navigation */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <button
                                    onClick={prevMonth}
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', padding: '5px 12px', fontSize: '0.85rem' }}
                                >◀</button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                        {MONTH_NAMES[calMonth.month]} {calMonth.year}
                                    </span>
                                    <button
                                        onClick={() => setCalMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                                        style={{ background: 'rgba(0,165,165,0.15)', border: '1px solid rgba(0,165,165,0.3)', borderRadius: '6px', color: 'var(--pico-teal)', cursor: 'pointer', padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600 }}
                                    >Today</button>
                                </div>
                                <button
                                    onClick={nextMonth}
                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer', padding: '5px 12px', fontSize: '0.85rem' }}
                                >▶</button>
                            </div>

                            {/* Day headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px', gap: '2px' }}>
                                {DAY_NAMES.map(d => (
                                    <div key={d} style={{ textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '3px' }}>
                                {days.map((d, i) => {
                                    if (!d) return <div key={`empty-${i}`} style={{ minHeight: '64px' }} />;
                                    const ds = dayStr(d);
                                    const isToday = ds === TODAY;
                                    const onDay = projectsOnDay(d);
                                    const hasDeadline = isDeadlineDay(ds);
                                    return (
                                        <div key={ds} style={{
                                            minHeight: '64px', padding: '4px 3px', borderRadius: '7px',
                                            background: isToday ? 'rgba(0,165,165,0.15)' : 'rgba(255,255,255,0.03)',
                                            border: isToday ? '1.5px solid var(--pico-teal)' : '1px solid rgba(255,255,255,0.06)',
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                fontSize: '0.72rem', fontWeight: isToday ? 800 : 400,
                                                color: isToday ? 'var(--pico-teal)' : 'var(--text-secondary)',
                                                textAlign: 'center', marginBottom: '3px',
                                            }}>
                                                {d}
                                                {hasDeadline && <span style={{ color: '#ef4444', marginLeft: '1px', fontSize: '0.6rem' }}>●</span>}
                                            </div>
                                            {onDay.slice(0, 4).map((p, barIdx) => (
                                                <div
                                                    key={`${p.id}-${p._designerName}`}
                                                    title={`${p._designerName}: ${p.name}`}
                                                    onClick={() => { selectDesigner(designers.find(d => d.name === p._designerName)?.id); openEditProject(p); }}
                                                    style={{
                                                        height: '5px', borderRadius: '3px', marginBottom: '2px',
                                                        background: p._color,
                                                        cursor: 'pointer', opacity: p.status === 'completed' ? 0.4 : 0.9,
                                                    }}
                                                />
                                            ))}
                                            {onDay.length > 4 && (
                                                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                                    +{onDay.length - 4}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Legend — one row per designer */}
                            {designers.some(d => (d.projects || []).length > 0) && (
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem' }}>
                                        {designers.map((designer, dIdx) => {
                                            const color = COLORS[dIdx % COLORS.length];
                                            const active = activeProjects(designer).length;
                                            const total = (designer.projects || []).length;
                                            if (total === 0) return null;
                                            return (
                                                <div
                                                    key={designer.id}
                                                    onClick={() => selectDesigner(designer.id)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '7px',
                                                        cursor: 'pointer',
                                                        opacity: designer.id === selectedId ? 1 : 0.65,
                                                        transition: 'opacity 0.15s',
                                                    }}
                                                >
                                                    {/* colour swatch */}
                                                    <div style={{ width: '14px', height: '8px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.78rem', fontWeight: designer.id === selectedId ? 700 : 500, color: 'var(--text-secondary)' }}>
                                                        {designer.name}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        {active} active / {total} total
                                                    </span>
                                                </div>
                                            );
                                        })}
                                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto', alignSelf: 'center' }}>
                                            🔴 = deadline
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Project list */}
                        {(selected.projects || []).length === 0 ? (
                            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                                <p style={{ color: 'var(--text-muted)', margin: 0 }}>No projects yet. Click <strong>+ Add Project</strong> to get started.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {[...selected.projects]
                                    .sort((a, b) => {
                                        if (a.status === 'completed' && b.status !== 'completed') return 1;
                                        if (b.status === 'completed' && a.status !== 'completed') return -1;
                                        return a.deadline.localeCompare(b.deadline);
                                    })
                                    .map(project => {
                                        const idx = (selected.projects || []).findIndex(x => x.id === project.id);
                                        const color = COLORS[idx % COLORS.length];
                                        const overdue = isOverdue(project);
                                        const st = overdue ? { label: 'Overdue', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' } : (STATUS_CONFIG[project.status] || STATUS_CONFIG['in-progress']);
                                        return (
                                            <div key={project.id} className="card" style={{
                                                padding: '1rem 1.25rem',
                                                borderLeft: `4px solid ${color}`,
                                                display: 'flex', alignItems: 'center', gap: '1rem',
                                                opacity: project.status === 'completed' ? 0.7 : 1,
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', fontSize: '0.95rem' }}>
                                                        {project.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span>📅 Start: <strong style={{ color: 'var(--text-secondary)' }}>{fmtDate(project.startDate)}</strong></span>
                                                        <span>·</span>
                                                        <span>⏰ Deadline: <strong style={{ color: overdue ? '#ef4444' : 'var(--text-secondary)' }}>{fmtDate(project.deadline)}</strong></span>
                                                    </div>
                                                    {project.notes && (
                                                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                                                            {project.notes}
                                                        </div>
                                                    )}
                                                </div>
                                                <span style={{
                                                    padding: '3px 11px', borderRadius: '20px', fontSize: '0.72rem',
                                                    fontWeight: 700, color: st.color, background: st.bg, whiteSpace: 'nowrap', flexShrink: 0,
                                                }}>
                                                    {st.label}
                                                </span>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => openEditProject(project)}
                                                    style={{ fontSize: '0.78rem', flexShrink: 0 }}
                                                >✏️ Edit</button>
                                                <button
                                                    onClick={() => deleteProject(project.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.9rem', padding: '4px', flexShrink: 0 }}
                                                    title="Delete project"
                                                >🗑</button>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎨</div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', margin: 0 }}>Select a designer from the list to view their calendar and projects.</p>
                    </div>
                )}
            </div>

            {/* ── Add Designer Modal ───────────────────────────────── */}
            {addDesignerOpen && (
                <div className="modal-overlay" onClick={() => setAddDesignerOpen(false)}>
                    <div className="modal-box" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setAddDesignerOpen(false)}>✕</button>
                        <div className="modal-body">
                            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>Add New Designer</h3>
                            <div className="form-group">
                                <label className="form-label">Designer Name *</label>
                                <input
                                    className="form-input"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addDesigner()}
                                    placeholder="e.g. Ahmed Al-Rashid"
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                                <button className="btn btn-primary" style={{ flex: 1 }} onClick={addDesigner} disabled={saving || !newName.trim()}>
                                    {saving ? 'Adding...' : 'Add Designer'}
                                </button>
                                <button className="btn" onClick={() => setAddDesignerOpen(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add / Edit Project Modal ─────────────────────────── */}
            {projectModalOpen && (
                <div className="modal-overlay" onClick={() => setProjectModalOpen(false)}>
                    <div className="modal-box" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setProjectModalOpen(false)}>✕</button>
                        <div className="modal-body">
                            <h3 style={{ margin: '0 0 1.25rem', fontSize: '1.1rem' }}>
                                {editingProject ? '✏️ Edit Project' : '+ New Project'}
                            </h3>

                            {projectError && (
                                <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>
                                    ⚠️ {projectError}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Project Name *</label>
                                <input
                                    className="form-input"
                                    value={projectForm.name}
                                    onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Exhibition Booth Banner"
                                    autoFocus
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label className="form-label">Start Date *</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={projectForm.startDate}
                                        onChange={e => setProjectForm(p => ({ ...p, startDate: e.target.value }))}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Deadline *</label>
                                    <input
                                        className="form-input"
                                        type="date"
                                        value={projectForm.deadline}
                                        onChange={e => setProjectForm(p => ({ ...p, deadline: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select
                                    className="form-input"
                                    value={projectForm.status}
                                    onChange={e => setProjectForm(p => ({ ...p, status: e.target.value }))}
                                >
                                    <option value="pending">⏳ Pending</option>
                                    <option value="in-progress">🔵 In Progress</option>
                                    <option value="review">🟣 In Review</option>
                                    <option value="completed">✅ Completed</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Notes <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                                <textarea
                                    className="form-textarea"
                                    value={projectForm.notes}
                                    onChange={e => setProjectForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder="Client name, event details, special requirements..."
                                    rows={2}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1 }}
                                    onClick={saveProject}
                                    disabled={saving || !projectForm.name || !projectForm.startDate || !projectForm.deadline}
                                >
                                    {saving ? 'Saving...' : editingProject ? 'Save Changes' : 'Add Project'}
                                </button>
                                <button className="btn" onClick={() => setProjectModalOpen(false)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
