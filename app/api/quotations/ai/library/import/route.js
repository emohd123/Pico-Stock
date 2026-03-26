import { NextResponse } from 'next/server';
import {
    getHistoricalQuotationImportDirectory,
    getQuotationAiLibraryStats,
    importHistoricalQuotationLibrary,
    syncSystemQuotationToAiLibrary,
} from '@/lib/quotationAiLibrary';
import { getQuotationById, getQuotations } from '@/lib/quotationStore';

export const runtime = 'nodejs';

async function rebuildSystemLibrary() {
    const quotations = await getQuotations();
    let synced = 0;
    for (const quotation of quotations) {
        const fullQuotation = await getQuotationById(quotation.id);
        if (!fullQuotation) continue;
        await syncSystemQuotationToAiLibrary(fullQuotation);
        synced += 1;
    }
    return synced;
}

export async function GET() {
    try {
        const stats = await getQuotationAiLibraryStats();
        return NextResponse.json({
            stats,
            source_dir: getHistoricalQuotationImportDirectory(),
        });
    } catch (error) {
        console.error('[quotation ai library] stats failed:', error);
        return NextResponse.json({ error: 'Failed to load AI library status' }, { status: 500 });
    }
}

export async function POST() {
    try {
        const historical = await importHistoricalQuotationLibrary();
        const systemIndexed = await rebuildSystemLibrary();
        const stats = await getQuotationAiLibraryStats();
        return NextResponse.json({
            historical,
            system_indexed: systemIndexed,
            stats,
        });
    } catch (error) {
        console.error('[quotation ai library] import failed:', error);
        return NextResponse.json({ error: 'Failed to import quotation AI library' }, { status: 500 });
    }
}
