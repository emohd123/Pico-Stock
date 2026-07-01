import { notFound } from 'next/navigation';
import { getMinistryByToken, getActiveCatalog, getMinistryQuotations, getMinistryPhotos } from '@/lib/ministry/queries';
import { itemImage } from '@/lib/ministry/itemImages';
import PortalClient from './PortalClient';

export const dynamic = 'force-dynamic';

export default async function MinistryPortalPage({ params }) {
    const { token } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) notFound();

    const [catalog, quotationRows, photoRows] = await Promise.all([
        getActiveCatalog(),
        getMinistryQuotations(ministry.id),
        getMinistryPhotos(ministry.id),
    ]);

    const items = catalog.map((c) => ({
        id: c.id, itemNo: c.itemNo, name: c.name, description: c.description || '', category: c.category,
        defaultQty: c.defaultQty, maxQty: c.defaultQty, qtyFixed: c.qtyFixed, unit: c.unit || '',
        unitPriceFils: c.unitPriceFils, imageUrl: itemImage(c.itemNo),
    }));

    const quotations = quotationRows.map((q, idx) => ({
        id: q.id, ref: q.ref, eventName: q.eventName || '', revision: q.revision, notes: q.notes || '',
        status: q.status, isCurrent: idx === 0, totalFils: q.totalFils,
        createdAt: (q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt)).toISOString(),
        pdfBlobUrl: q.pdfBlobUrl ? `/q/${token}/quote/${q.id}/pdf` : '',
    }));

    const photos = photoRows.map((p) => ({ id: p.id, url: `/q/${token}/photo/${p.id}`, caption: p.caption || '' }));

    return (
        <PortalClient
            token={token}
            ministryName={ministry.name}
            ministryNameAr={ministry.nameAr || ''}
            items={items}
            quotations={quotations}
            photos={photos}
        />
    );
}
