import { notFound } from 'next/navigation';
import { getMinistryByToken, getActiveCatalog, getMinistryQuotations, getMinistryPhotos, getAllMinistries, getRecentQuotations } from '@/lib/ministry/queries';
import { itemImage } from '@/lib/ministry/itemImages';
import PortalClient from './PortalClient';

export const dynamic = 'force-dynamic';

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Parse the portal's readable date string (e.g. "2, 3 July 2026 · 1 August 2026")
// back into ISO days. Non-matching / free-text values are skipped.
function parseEventDates(str) {
    if (!str) return [];
    const out = [];
    for (const group of String(str).split('·')) {
        const m = group.trim().match(/^([\d,\s]+)\s+([A-Za-z]+)\s+(\d{4})$/);
        if (!m) continue;
        const days = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 31);
        const monIdx = MONTHS_FULL.findIndex((mm) => mm.toLowerCase() === m[2].toLowerCase());
        const year = parseInt(m[3], 10);
        if (monIdx < 0 || !year) continue;
        for (const d of days) out.push(`${year}-${String(monIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return out;
}

export default async function MinistryPortalPage({ params }) {
    const { token } = params;
    const ministry = await getMinistryByToken(token);
    if (!ministry) notFound();

    const [catalog, quotationRows, allMinistries, allQuotes] = await Promise.all([
        getActiveCatalog(),
        getMinistryQuotations(ministry.id),
        getAllMinistries(),
        getRecentQuotations(200),
    ]);

    // Booked-dates calendar so ministries can see which dates are already taken
    // (their own + other ministries') before choosing their meeting days.
    const nameById = new Map(allMinistries.map((m) => [m.id, m.name]));
    const latestByMinistry = new Map();
    for (const q of allQuotes) if (!latestByMinistry.has(q.ministryId)) latestByMinistry.set(q.ministryId, q);
    const bookedEntries = [];
    for (const q of latestByMinistry.values()) {
        const name = nameById.get(q.ministryId) || 'Ministry';
        const label = `${name}${q.eventName ? ' — ' + q.eventName : ''}${q.venue ? ' · Meeting Location: ' + q.venue : ''}`;
        for (const isoDay of parseEventDates(q.eventDate)) {
            bookedEntries.push({ iso: isoDay, label });
        }
    }

    // Shared event gallery: every ministry portal shows all ministries' albums,
    // with this ministry's own album first and open by default.
    const allAlbums = await Promise.all(allMinistries.map(async (m) => ({
        id: m.id, name: m.name, nameAr: m.nameAr || '',
        photos: (await getMinistryPhotos(m.id)).map((p) => ({ id: p.id, caption: p.caption || '' })),
    })));
    // Only show ministries that actually have photos; this ministry's album first.
    const albums = allAlbums.filter((a) => a.photos.length > 0);
    albums.sort((a, b) => (a.id === ministry.id ? -1 : b.id === ministry.id ? 1 : 0));
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
            bookedEntries={bookedEntries}
        />
    );
}
