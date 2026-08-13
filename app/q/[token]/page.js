import { notFound } from 'next/navigation';
import { getMinistryByToken, getActiveCatalog, getMinistryQuotations, getMinistryPhotos, getAllMinistries, pickCoverPhotoId, getQuotationForMinistry, getQuotationLines } from '@/lib/ministry/queries';
import { isCustomItemNo } from '@/lib/ministry/quotationScan';
import { itemImage } from '@/lib/ministry/itemImages';
import PortalClient from './PortalClient';

export const dynamic = 'force-dynamic';

export default async function MinistryPortalPage({ params, searchParams }) {
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
    const allAlbums = await Promise.all(allMinistries.map(async (m) => {
        const photos = await getMinistryPhotos(m.id);
        return {
            id: m.id, name: m.name, nameAr: m.nameAr || '',
            coverId: pickCoverPhotoId(m.coverPhotoId, photos),
            photos: photos.map((p) => ({ id: p.id, caption: p.caption || '' })),
        };
    }));
    // Only show ministries that actually have photos; this ministry's album first.
    const albums = allAlbums.filter((a) => a.photos.length > 0);
    albums.sort((a, b) => (a.id === ministry.id ? -1 : b.id === ministry.id ? 1 : 0));
    const galleryCount = albums.reduce((n, a) => n + a.photos.length, 0);

    const items = catalog.map((c) => ({
        id: c.id, itemNo: c.itemNo, name: c.name, description: c.description || '', category: c.category,
        defaultQty: c.defaultQty, maxQty: c.defaultQty, qtyFixed: c.qtyFixed, unit: c.unit || '',
        unitPriceFils: c.unitPriceFils, imageUrl: itemImage(c.itemNo),
    }));

    // ?from=<id> opens the picker already filled in from an existing quotation,
    // so a change is an edit of what was quoted rather than a re-entry of all
    // thirty rows. Scoped to this ministry, so a stray id cannot leak another's.
    const fromId = parseInt(searchParams?.from, 10) || 0;
    let prefill = null;
    if (fromId) {
        const src = await getQuotationForMinistry(ministry.id, fromId);
        if (src) {
            const lines = await getQuotationLines(src.id);
            const byNo = new Map(catalog.map((c) => [c.itemNo, c]));
            const picks = {};
            const extras = [];
            for (const l of lines) {
                // A custom line has no catalogue equivalent; keep it as an extra
                // so regenerating cannot silently drop what it priced.
                if (isCustomItemNo(l.itemNo) || !byNo.has(l.itemNo)) {
                    extras.push({
                        name: l.nameSnapshot, qty: l.qty,
                        unit: 'nos', unitPriceFils: l.unitPriceFils,
                    });
                    continue;
                }
                picks[byNo.get(l.itemNo).id] = l.qty;
            }
            prefill = {
                id: src.id, ref: src.ref, revision: src.revision,
                eventName: src.eventName || '', venue: src.venue || '',
                eventDate: src.eventDate || '', duration: src.duration || '',
                picks, extras,
            };
        }
    }

    const quotations = quotationRows.map((q, idx) => ({
        id: q.id, ref: q.ref, eventName: q.eventName || '', revision: q.revision, notes: q.notes || '',
        status: q.status, isCurrent: idx === 0, totalFils: q.totalFils,
        createdAt: (q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt)).toISOString(),
        pdfBlobUrl: q.pdfBlobUrl ? `/q/${token}/quote/${q.id}/pdf?v=${encodeURIComponent((q.pdfBlobUrl || '').split('/').pop() || q.id)}` : '',
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
            prefill={prefill}
        />
    );
}
