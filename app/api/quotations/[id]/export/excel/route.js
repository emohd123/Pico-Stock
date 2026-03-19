import { generateQuotationWorkbook } from '@/lib/quotationExport';
import { getQuotationById } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
    const quotation = await getQuotationById(params.id);

    if (!quotation) {
        return Response.json({ error: 'Quotation not found' }, { status: 404 });
    }

    try {
        const workbook = generateQuotationWorkbook(quotation);
        const safeName = (quotation.project_title || 'Quotation').replace(/[^a-z0-9]+/gi, '_');

        return new Response(workbook, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="QT-${quotation.qt_number}_${safeName}.xlsx"`,
            },
        });
    } catch (error) {
        return Response.json({ error: 'Failed to generate quotation workbook' }, { status: 500 });
    }
}
