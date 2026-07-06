import { notFound } from 'next/navigation';
import { getMinistryByToken, getActiveCatalog, getMinistryQuotations, getMinistryPhotos, getAllMinistries } from '@/lib/ministry/queries';
import { itemImage } from '@/lib/ministry/itemImages';
import PortalClient from './PortalClient';

export const dynamic = 'force-dynamic';

export default async function MinistryPortalPage({ params }) {
    const { token } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) notFound();

    const [catalog, quotationRows, allMinistries] = await Promise.all([
        getActiveCatalog(),
        getMinistryQuotations(ministry.id),
        getAllMinistries(),
    ]);

    // Shared event gallery: every ministry portal shows all ministries' albums,
    // with this ministry's own album first and open by default.
    const albums = await Promise.all(allMinistries.map(async (m) => ({
        id: m.id, name: m.name, nameAr: m.nameAr || '',
        photos: (await getMinistryPhotos(m.id)).map((p) => ({ id: p.id, caption: p.caption || '' })),
    })));
    albums.sort((a, b) => {
        if (a.id === ministry.id) return -1;
        if (b.id === ministry.id) return 1;
        return (b.photos.length > 0) - (a.photos.length > 0);
    });
    const galleryCount = albums.reduce((n, a) => n + a.photos.length, 0);

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

    return (
        <PortalClient
            token={token}
            ministryId={ministry.id}
            ministryName={ministry.name}
            ministryNameAr={ministry.nameAr || ''}
            items={items}
            quotations={quotations}
            albums={albums}
            galleryCount={galleryCount}
        />
    );
}
