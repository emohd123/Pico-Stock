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
                            <td><strong>QT-{quote.qt_number}</strong></td>
                            <td>{quote.date || '--'}</td>
                            <td>{quote.project_title || 'Untitled quotation'}</td>
                            <td>{quote.client_org || quote.client_to || '--'}</td>
                            <td>{quote.created_by || '--'}</td>
                            <td>{getReferenceSummary ? getReferenceSummary(quote) : '--'}</td>
                            <td>BHD {formatMoney(quote.total_with_vat)}</td>
                            <td><StatusPill status={quote.status} /></td>
                            <td>
                                <div className="quotation-dashboard-actions">
                                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => onOpen(quote.id)}>Edit</button>
                                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => onExportPdf(quote.id, 'customer')}>PDF</button>
                                    <button type="button" className="quotation-btn quotation-btn-ghost" onClick={() => onDuplicate(quote.id)}>Duplicate</button>
                                    <button type="button" className="quotation-btn quotation-btn-danger" onClick={() => onDelete(quote.id)}>Delete</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
