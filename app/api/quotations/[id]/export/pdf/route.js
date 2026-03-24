import { generateQuotationPdf } from '@/lib/quotationExport';
import { getQuotationById } from '@/lib/quotationStore';
import { getSignatureByName } from '@/lib/signatureStore';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    const quotation = await getQuotationById(params.id);

    if (!quotation) {
        return Response.json({ error: 'Quotation not found' }, { status: 404 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') === 'management' ? 'management' : 'customer';

        // Fetch signature/stamp for the creator (null if not found)
        let staffSig = null;
        if (quotation.created_by?.trim()) {
            try {
                staffSig = await getSignatureByName(quotation.created_by.trim());
            } catch {}
        }

        const pdf = await generateQuotationPdf(quotation, mode, staffSig);
        const safeName = (quotation.project_title || 'Quotation').replace(/[^a-z0-9]+/gi, '_');

        return new Response(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="QT-${quotation.qt_number}_${safeName}_${mode}.pdf"`,
            },
        });
    } catch (error) {
        console.error('[PDF] generation failed:', error);
        return Response.json({ error: 'Failed to generate quotation PDF', detail: String(error) }, { status: 500 });
    }
}
