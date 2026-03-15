'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const FILE_TYPES = [
    { value: '', label: 'All file types' },
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'DOCX' },
    { value: 'xlsx', label: 'XLSX' },
    { value: 'pptx', label: 'PPTX' },
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'mp4', label: 'MP4' },
];

const UNDERSTANDING_LEVELS = [
    { value: '', label: 'All understanding levels' },
    { value: 'content_understood', label: 'Content understood' },
    { value: 'filename_path_inferred', label: 'Filename/path inferred' },
    { value: 'metadata_only', label: 'Metadata only' },
    { value: 'needs_review', label: 'Needs review' },
];

const SOURCE_STATUSES = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'archived', label: 'Archived' },
    { value: 'missing', label: 'Missing' },
];

const SAMPLE_QUERIES = [
    'Find Tamkeen quotation',
    'Show Ramadan activation renders',
    'List Nestle contracts',
    'Find Caribbean event photos',
    'Show files under RESOURCES related to branding',
];

const EMPTY_ASK = {
    answer: '',
    confidence: 'low',
    confidenceScore: 0,
    lowConfidence: false,
    supportingFiles: [],
    queryExplanation: '',
};

export default function PCloudSearchPage() {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [sort, setSort] = useState('relevance');
    const [loading, setLoading] = useState(true);
    const [asking, setAsking] = useState(false);
    const [queryExplanation, setQueryExplanation] = useState('');
    const [semantic, setSemantic] = useState(null);
    const [askResponse, setAskResponse] = useState(EMPTY_ASK);
    const [filters, setFilters] = useState({
        fileType: '',
        client: '',
        project: '',
        folderPrefix: '',
        status: '',
        understandingLevel: '',
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const isAdmin = sessionStorage.getItem('pico-admin');
            if (!isAdmin) {
                router.push('/admin/login');
                return;
            }
        }
    }, [router]);

    const [debouncedQuery, setDebouncedQuery] = useState(query);

    // Debounce query input to avoid DDOSing the database during typing
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
            setPage(1); // Reset to first page on new search
        }, 350);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                q: debouncedQuery,
                page: String(page),
                pageSize: String(pageSize),
                sort,
            });

            Object.entries(filters).forEach(([key, value]) => {
                if (value) params.set(key, value);
            });

            const response = await fetch(`/api/pcloud/search?${params.toString()}`);
            const data = await response.json();

            if (data.success) {
                setResults(data.results || []);
                setTotal(data.total || 0);
                setQueryExplanation(data.queryExplanation || '');
                setSemantic(data.semantic || null);
            }
        } catch (error) {
            console.error(error);
        }
        setLoading(false);
    }, [filters, page, pageSize, debouncedQuery, sort]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    const handleFilterChange = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1);
    };

    const handleSearchSubmit = async (event) => {
        event.preventDefault();
        if (page !== 1) {
            setPage(1);
            return;
        }
        await fetchResults();
    };

    const handleAsk = async () => {
        setAsking(true);
        try {
            const response = await fetch('/api/pcloud/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query,
                    filters,
                    pageSize: 6,
                }),
            });
            const data = await response.json();
            if (data.success) {
                setAskResponse({
                    answer: data.answer,
                    confidence: data.confidence,
                    confidenceScore: data.confidenceScore,
                    lowConfidence: data.lowConfidence,
                    supportingFiles: data.supportingFiles || [],
                    queryExplanation: data.queryExplanation || '',
                });
            }
        } catch (error) {
            console.error(error);
        }
        setAsking(false);
    };

    const totalPages = useMemo(() => Math.max(Math.ceil(total / pageSize), 1), [pageSize, total]);

    const handleOpenLocation = async (fileId) => {
        try {
            const res = await fetch('/api/pcloud/open-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId }),
            });
            const data = await res.json();
            if (!data.success) {
                // Fallback: show the path in an alert so they can navigate manually
                alert(data.relativePath
                    ? `No absolute path stored. Relative path:\n${data.relativePath}`
                    : data.error || 'Could not open file location.');
            }
        } catch {
            alert('Could not open file location.');
        }
    };

    return (
        <div className="pcloud-page-shell">
            <div className="pcloud-page-header">
                <div className="pcloud-page-title-wrap">
                    <Link href="/admin/pcloud" className="pcloud-back-link">← pCloud</Link>
                    <h1 className="pcloud-page-title">Smart Search + Ask pCloud</h1>
                    <p className="pcloud-page-subtitle">
                        Search indexed pCloud files by filename, path, extracted text, and AI-inferred metadata.
                    </p>
                </div>
            </div>

            <div className="pcloud-search-layout">
                <section className="card pcloud-search-main">
                    <form className="pcloud-search-form" onSubmit={handleSearchSubmit}>
                        <label className="form-label" htmlFor="pcloud-search-query">Natural-language search</label>
                        <div className="pcloud-search-input-row">
                            <input
                                id="pcloud-search-query"
                                className="form-input pcloud-search-input"
                                placeholder="Find Tamkeen quotation, Ramadan renders, Nestle contracts..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                            <button type="submit" className="btn btn-primary">Search</button>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleAsk}
                                disabled={!query.trim() || asking}
                            >
                                {asking ? 'Thinking...' : 'Ask pCloud'}
                            </button>
                        </div>
                        <div className="pcloud-search-samples">
                            {SAMPLE_QUERIES.map((sample) => (
                                <button
                                    key={sample}
                                    type="button"
                                    className="pcloud-chip-button"
                                    onClick={() => {
                                        setQuery(sample);
                                        setPage(1);
                                    }}
                                >
                                    {sample}
                                </button>
                            ))}
                        </div>
                    </form>

                    <div className="pcloud-filter-grid">
                        <select className="form-input" value={filters.fileType} onChange={(event) => handleFilterChange('fileType', event.target.value)}>
                            {FILE_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <input className="form-input" placeholder="Client" value={filters.client} onChange={(event) => handleFilterChange('client', event.target.value)} />
                        <input className="form-input" placeholder="Project" value={filters.project} onChange={(event) => handleFilterChange('project', event.target.value)} />
                        <input className="form-input" placeholder="Folder prefix" value={filters.folderPrefix} onChange={(event) => handleFilterChange('folderPrefix', event.target.value)} />
                        <select className="form-input" value={filters.status} onChange={(event) => handleFilterChange('status', event.target.value)}>
                            {SOURCE_STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <select className="form-input" value={filters.understandingLevel} onChange={(event) => handleFilterChange('understandingLevel', event.target.value)}>
                            {UNDERSTANDING_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                    </div>

                    <div className="pcloud-search-toolbar">
                        <div className="pcloud-query-explanation">
                            <strong>How this search works:</strong> {queryExplanation || 'Search across filenames, paths, extracted text, and inferred metadata.'}
                        </div>
                        <div className="pcloud-search-toolbar-actions">
                            <label className="form-label pcloud-inline-label" htmlFor="pcloud-sort-select">Sort</label>
                            <select
                                id="pcloud-sort-select"
                                className="form-input pcloud-inline-select"
                                value={sort}
                                onChange={(event) => {
                                    setSort(event.target.value);
                                    setPage(1);
                                }}
                            >
                                <option value="relevance">Relevance</option>
                                <option value="newest">Newest</option>
                            </select>
                        </div>
                    </div>

                    {semantic && (
                        <div className="pcloud-semantic-note">
                            Semantic search provider: <strong>{semantic.provider}</strong>. {semantic.enabled ? 'Semantic hits are blended into ranking.' : 'Semantic search is not enabled yet; results are keyword + metadata based.'}
                        </div>
                    )}

                    {loading ? (
                        <div className="pcloud-search-loading"><div className="spinner"></div></div>
                    ) : results.length === 0 ? (
                        <div className="pcloud-search-empty">
                            <div className="pcloud-search-empty-icon">🔎</div>
                            <h3>No matching files found</h3>
                            <p>Try a broader search, fewer filters, or Ask pCloud for a cautious summary.</p>
                        </div>
                    ) : (
                        <>
                            <div className="pcloud-results-summary">
                                Showing {results.length} of {total} matching files
                            </div>
                            <div className="pcloud-results-list">
                                {results.map((result) => (
                                    <article key={result.id} className="pcloud-result-card">
                                        <div className="pcloud-result-header">
                                            <div className="pcloud-result-title-wrap">
                                                <button
                                                    type="button"
                                                    className="pcloud-result-link"
                                                    title="Open file location in Explorer"
                                                    onClick={() => handleOpenLocation(result.id)}
                                                >
                                                    {result.filename}
                                                </button>
                                                <div className="pcloud-result-path">{result.relativePath}</div>
                                            </div>
                                            <div className="pcloud-result-score">
                                                <span className="pcloud-score-label">Relevance</span>
                                                <strong>{Math.round((result.relevanceScore || 0) * 100)}%</strong>
                                            </div>
                                        </div>

                                        <div className="pcloud-result-meta">
                                            <span><strong>Client:</strong> {result.detectedClient || '—'}</span>
                                            <span><strong>Project:</strong> {result.detectedProject || '—'}</span>
                                            <span><strong>Doc type:</strong> {result.detectedDocumentType || '—'}</span>
                                            <span><strong>Understanding:</strong> {result.understandingLevel || '—'}</span>
                                            <span><strong>AI confidence:</strong> {Math.round((result.confidenceScore || 0) * 100)}%</span>
                                        </div>

                                        <div className="pcloud-result-summary">
                                            {result.explanation.summary}
                                        </div>

                                        <div className="pcloud-result-reasons">
                                            <div className="pcloud-result-primary-reason">{result.explanation.primaryReason}</div>
                                            <ul className="pcloud-result-reason-list">
                                                {result.explanation.reasons.slice(0, 4).map((reason) => (
                                                    <li key={`${result.id}-${reason.label}-${reason.detail}`}>{reason.detail}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            {totalPages > 1 && (
                                <div className="pcloud-pagination">
                                    <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                                        ← Previous
                                    </button>
                                    <span>Page {page} of {totalPages}</span>
                                    <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
                                        Next →
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </section>

                <aside className="card pcloud-ask-panel">
                    <div className="pcloud-ask-header">
                        <h2>Ask pCloud</h2>
                        <p>Get a short answer with supporting files. If confidence is low, the answer will say so.</p>
                    </div>

                    {!askResponse.answer ? (
                        <div className="pcloud-ask-empty">
                            Run a natural-language search, then click <strong>Ask pCloud</strong> for a cautious answer.
                        </div>
                    ) : (
                        <div className="pcloud-ask-thread">
                            <div className="pcloud-ask-bubble pcloud-ask-bubble-user">{query}</div>
                            <div className="pcloud-ask-bubble pcloud-ask-bubble-system">
                                <div className={`pcloud-ask-confidence pcloud-ask-confidence-${askResponse.confidence}`}>
                                    {askResponse.confidence} confidence ({Math.round((askResponse.confidenceScore || 0) * 100)}%)
                                </div>
                                <p>{askResponse.answer}</p>
                                {askResponse.lowConfidence && (
                                    <p className="pcloud-ask-warning">
                                        This answer is low confidence. Please verify the supporting files before using it operationally.
                                    </p>
                                )}
                                <div className="pcloud-ask-explanation">{askResponse.queryExplanation}</div>
                            </div>

                            <div className="pcloud-ask-supporting">
                                <h3>Supporting files</h3>
                                {askResponse.supportingFiles.length === 0 ? (
                                    <p>No supporting files found.</p>
                                ) : (
                                    <div className="pcloud-ask-supporting-list">
                                        {askResponse.supportingFiles.map((file) => (
                                            <button
                                                key={file.id}
                                                type="button"
                                                className="pcloud-supporting-card"
                                                title="Open file location in Explorer"
                                                onClick={() => handleOpenLocation(file.id)}
                                            >
                                                <strong>{file.filename}</strong>
                                                <span>{file.relativePath}</span>
                                                <span>{file.explanation.primaryReason}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
