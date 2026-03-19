import { generateQuotationPdf } from '@/lib/quotationExport';
import { getQuotationById } from '@/lib/quotationStore';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    const quotation = await getQuotationById(params.id);

    if (!quotation) {
        return Response.json({ error: 'Quotation not found' }, { status: 404 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') === 'management' ? 'management' : 'customer';
        const pdf = await generateQuotationPdf(quotation, mode);
        const safeName = (quotation.project_title || 'Quotation').replace(/[^a-z0-9]+/gi, '_');

        return new Response(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="QT-${quotation.qt_number}_${safeName}_${mode}.pdf"`,
            },
        });
    } catch (error) {
        return Response.json({ error: 'Failed to generate quotation PDF' }, { status: 500 });
    }
}
