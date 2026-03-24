function StatusPill({ status }) {
    return <span className={`quotation-status-pill quotation-status-pill-${String(status || 'Draft').toLowerCase()}`}>{status || 'Draft'}</span>;
}

export default function QuotationDashboardTable({
    quotes,
    onOpen,
    onDuplicate,
    onDelete,
    onExportPdf,
    onExportExcel,
    formatMoney,
    getReferenceSummary,
}) {
    if (quotes.length === 0) {
        return (
            <div className="quotation-dashboard-empty">
                <strong>No quotations found</strong>
                <p>Create a new quotation or change the current filters.</p>
            </div>
        );
    }

    return (
        <div className="quotation-dashboard-table-wrap">
            <table className="quotation-dashboard-table">
                <thead>
                    <tr>
                        <th>QT #</th>
                        <th>Date</th>
                        <th>Project</th>
                        <th>Client</th>
                        <th>Owner</th>
                        <th>References</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {quotes.map((quote) => (
                        <tr key={quote.id}>
                            <td>
                                <div className="quotation-dashboard-qt">
                                    <strong>QT-{quote.qt_number}</strong>
                                </div>
                            </td>
                            <td>{quote.date || '--'}</td>
                            <td>
                                <div className="quotation-dashboard-project">{quote.project_title || 'Untitled quotation'}</div>
                            </td>
                            <td>
                                <div className="quotation-dashboard-client">{quote.client_org || quote.client_to || '--'}</div>
                            </td>
                            <td>{quote.created_by || '--'}</td>
                            <td>
                                <div className="quotation-dashboard-reference">{getReferenceSummary ? getReferenceSummary(quote) : '--'}</div>
                                {Array.isArray(quote.attachments) && quote.attachments.length > 0 ? (
                                    <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: '#64748b' }}>
                                        Files: {quote.attachments.length}
                                    </div>
                                ) : null}
                            </td>
                            <td>
                                <div className="quotation-dashboard-total">{formatMoney(quote.total_with_vat, quote.currency_code, { withCode: true })}</div>
                            </td>
                            <td><StatusPill status={quote.status} /></td>
                            <td>
                                <div className="quotation-dashboard-actions">
                                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-dashboard-action-btn" onClick={() => onOpen(quote.id)}>Edit</button>
                                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-dashboard-action-btn" onClick={() => onExportPdf(quote.id, 'customer')}>PDF</button>
                                    <button type="button" className="quotation-btn quotation-btn-ghost quotation-dashboard-action-btn" onClick={() => onDuplicate(quote.id)}>Duplicate</button>
                                    <button type="button" className="quotation-btn quotation-btn-danger quotation-dashboard-action-btn" onClick={() => onDelete(quote.id)}>Delete</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
