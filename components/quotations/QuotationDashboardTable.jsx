export default function QuotationDashboardTable({
    quotes,
    onOpen,
    onDuplicate,
    onDelete,
    onStatusChange,
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
                                {quote.source_type === 'order' && quote.source_order_reference ? (
                                    <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: '#64748b' }}>
                                        From order: {quote.source_order_reference}
                                    </div>
                                ) : null}
                            </td>
                            <td>
                                <div className="quotation-dashboard-client">{quote.client_org || quote.client_to || '--'}</div>
                            </td>
                            <td>{quote.created_by || '--'}</td>
                            <td>
                                <div className="quotation-dashboard-reference">{getReferenceSummary ? getReferenceSummary(quote) : '--'}</div>
                                {quote.email_sent_at ? (
                                    <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: '#64748b' }}>
                                        Sent: {new Date(quote.email_sent_at).toLocaleDateString()}
                                    </div>
                                ) : null}
                                {Array.isArray(quote.attachments) && quote.attachments.length > 0 ? (
                                    <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: '#64748b' }}>
                                        Files: {quote.attachments.length}
                                    </div>
                                ) : null}
                            </td>
                            <td>
                                <div className="quotation-dashboard-total">{formatMoney(quote.total_with_vat, quote.currency_code, { withCode: true })}</div>
                            </td>
                            <td>
                                <div className={`quotation-dashboard-status-wrap quotation-status-pill quotation-status-pill-${String(quote.status || 'Draft').toLowerCase()}`}>
                                    <select
                                        className="quotation-input quotation-dashboard-status-select"
                                        value={quote.status || 'Draft'}
                                        onChange={(event) => onStatusChange?.(quote.id, event.target.value)}
                                    >
                                        <option value="Draft">Draft</option>
                                        <option value="Confirmed">Confirmed</option>
                                    </select>
                                    <span className="quotation-dashboard-status-arrow" aria-hidden="true"></span>
                                </div>
                            </td>
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
