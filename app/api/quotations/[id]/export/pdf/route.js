import { generateQuotationPdf } from '@/lib/quotationExport';
import { getQuotationById } from '@/lib/quotationStore';
import { getSignatureByName } from '@/lib/signatureStore';

export const runtime = 'nodejs';

function buildSafeName(quotation) {
    return (quotation?.project_title || 'Quotation').replace(/[^a-z0-9]+/gi, '_');
}

async function getStaffSignatureForQuotation(quotation) {
    if (!quotation?.created_by?.trim()) {
        return null;
    }

    try {
        return await getSignatureByName(quotation.created_by.trim());
    } catch {
        return null;
    }
}

export async function GET(request, { params }) {
    const quotation = await getQuotationById(params.id);

    if (!quotation) {
        return Response.json({ error: 'Quotation not found' }, { status: 404 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') === 'management' ? 'management' : 'customer';
        const staffSig = await getStaffSignatureForQuotation(quotation);

        const pdf = await generateQuotationPdf(quotation, mode, staffSig);
        const safeName = buildSafeName(quotation);

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

export async function POST(request) {
    try {
        const body = await request.json();
        const quotation = body?.quotation;
        const mode = body?.mode === 'management' ? 'management' : 'customer';

        if (!quotation || typeof quotation !== 'object') {
            return Response.json({ error: 'Quotation payload is required' }, { status: 400 });
        }

        const staffSig = await getStaffSignatureForQuotation(quotation);
        const pdf = await generateQuotationPdf(quotation, mode, staffSig);
        const safeName = buildSafeName(quotation);
        const qtNumber = quotation.qt_number || 'draft';

        return new Response(pdf, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="QT-${qtNumber}_${safeName}_${mode}.pdf"`,
            },
        });
    } catch (error) {
        console.error('[PDF] preview generation failed:', error);
        return Response.json({ error: 'Failed to generate quotation PDF', detail: String(error) }, { status: 500 });
    }
}
