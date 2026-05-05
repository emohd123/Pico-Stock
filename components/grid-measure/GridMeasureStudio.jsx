'use client';

import { useEffect, useRef, useState } from 'react';

function formatDate(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return '';
    }
}

async function readPayload(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text };
    }
}

export default function GridMeasureStudio() {
    const iframeRef = useRef(null);
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [projectName, setProjectName] = useState('New grid measure');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function fetchProjects() {
        setLoading(true);
        try {
            const response = await fetch('/api/grid-measure', { cache: 'no-store' });
            const payload = await response.json();
            setProjects(Array.isArray(payload.items) ? payload.items : []);
            if (payload.error) setMessage(payload.details || payload.error);
        } catch {
            setMessage('Could not load saved grid measure projects.');
        }
        setLoading(false);
    }

    useEffect(() => {
        fetchProjects();
    }, []);

    function getToolApi() {
        return iframeRef.current?.contentWindow?.GridMeasureAPI || null;
    }

    function buildPayload() {
        const api = getToolApi();
        if (!api) throw new Error('Grid Measure tool is still loading.');
        return {
            ...api.getProjectState(),
            name: projectName.trim() || 'Untitled grid measure',
        };
    }

    async function handleSave() {
        setSaving(true);
        setMessage('');
        try {
            const payload = buildPayload();
            const url = activeProject?.id ? `/api/grid-measure/${encodeURIComponent(activeProject.id)}` : '/api/grid-measure';
            const response = await fetch(url, {
                method: activeProject?.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await readPayload(response);
            if (!response.ok || !result.item) throw new Error(result.error || 'Save failed');
            setActiveProject(result.item);
            setProjectName(result.item.name);
            setMessage('Grid measure project saved.');
            await fetchProjects();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Save failed');
        }
        setSaving(false);
    }

    async function handleLoad(projectId) {
        setMessage('');
        try {
            const response = await fetch(`/api/grid-measure/${encodeURIComponent(projectId)}`, { cache: 'no-store' });
            const payload = await response.json();
            if (!response.ok || !payload.item) throw new Error(payload.error || 'Load failed');
            const api = getToolApi();
            if (!api) throw new Error('Grid Measure tool is still loading.');
            api.loadProject(payload.item);
            setActiveProject(payload.item);
            setProjectName(payload.item.name);
            setMessage(`Loaded ${payload.item.name}`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Load failed');
        }
    }

    async function handleDelete(projectId) {
        if (!confirm('Delete this grid measure project?')) return;
        setMessage('');
        try {
            const response = await fetch(`/api/grid-measure/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
            const payload = await readPayload(response);
            if (!response.ok) throw new Error(payload.error || 'Delete failed');
            if (activeProject?.id === projectId) {
                setActiveProject(null);
                setProjectName('New grid measure');
                getToolApi()?.clearProject();
            }
            setMessage('Project deleted.');
            await fetchProjects();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Delete failed');
        }
    }

    function handleNewProject() {
        setActiveProject(null);
        setProjectName('New grid measure');
        setMessage('');
        getToolApi()?.clearProject();
    }

    return (
        <div className="grid-measure-admin">
            <style jsx>{`
                .grid-measure-admin {
                    display: grid;
                    gap: 1rem;
                    min-height: calc(100vh - 3rem);
                }
                .grid-measure-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .grid-measure-title h1 {
                    margin: 0;
                    font-size: 1.6rem;
                }
                .grid-measure-title p {
                    margin: 0.25rem 0 0;
                    color: var(--text-muted);
                }
                .grid-measure-actions {
                    display: flex;
                    gap: 0.6rem;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .grid-measure-name {
                    min-width: 260px;
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-sm);
                    background: var(--bg-glass);
                    color: var(--text-primary);
                    padding: 0.65rem 0.8rem;
                }
                .grid-measure-shell {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) 280px;
                    gap: 1rem;
                    min-height: 720px;
                }
                .grid-measure-frame-wrap {
                    overflow: hidden;
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-lg);
                    background: #050505;
                    min-height: 720px;
                }
                .grid-measure-frame {
                    display: block;
                    width: 100%;
                    height: 780px;
                    border: 0;
                }
                .grid-measure-side {
                    display: grid;
                    align-content: start;
                    gap: 0.75rem;
                }
                .project-list {
                    display: grid;
                    gap: 0.5rem;
                    max-height: 620px;
                    overflow: auto;
                }
                .project-item {
                    text-align: left;
                    border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md);
                    background: var(--bg-glass);
                    color: var(--text-primary);
                    padding: 0.75rem;
                    cursor: pointer;
                }
                .project-item.active {
                    border-color: var(--pico-teal);
                }
                .project-item strong,
                .project-item span {
                    display: block;
                }
                .project-item span {
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    margin-top: 0.25rem;
                }
                .project-row {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: 0.4rem;
                }
                .message {
                    min-height: 1.2rem;
                    color: var(--text-muted);
                    font-size: 0.85rem;
                }
                @media (max-width: 1100px) {
                    .grid-measure-shell {
                        grid-template-columns: 1fr;
                    }
                    .grid-measure-frame {
                        height: 760px;
                    }
                }
            `}</style>

            <div className="grid-measure-header">
                <div className="grid-measure-title">
                    <h1>Grid Measure</h1>
                    <p>Upload stage plans, calibrate the 1m grid, measure surfaces, and save quantity takeoffs.</p>
                </div>
                <div className="grid-measure-actions">
                    <input
                        className="grid-measure-name"
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                        placeholder="Project name"
                    />
                    <button type="button" className="btn btn-secondary" onClick={handleNewProject}>
                        New
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : activeProject?.id ? 'Update Project' : 'Save Project'}
                    </button>
                </div>
            </div>

            <div className="message">{message}</div>

            <div className="grid-measure-shell">
                <div className="grid-measure-frame-wrap">
                    <iframe
                        ref={iframeRef}
                        className="grid-measure-frame"
                        title="Grid Measure Tool"
                        src="/admin/grid-measure/tool"
                    />
                </div>

                <aside className="grid-measure-side">
                    <h2 style={{ margin: 0 }}>Saved Projects</h2>
                    {loading ? (
                        <div className="message">Loading projects...</div>
                    ) : (
                        <div className="project-list">
                            {projects.length === 0 && <div className="message">No saved grid measurements yet.</div>}
                            {projects.map((project) => (
                                <div key={project.id} className="project-row">
                                    <button
                                        type="button"
                                        className={`project-item ${activeProject?.id === project.id ? 'active' : ''}`}
                                        onClick={() => handleLoad(project.id)}
                                    >
                                        <strong>{project.name}</strong>
                                        <span>{formatDate(project.updated_at)}</span>
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => handleDelete(project.id)}>
                                        Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
