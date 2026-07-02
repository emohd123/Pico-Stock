import { getClient, T } from './db';
import { CATALOG, isQtyFixed } from './catalog';
import { COMPANY } from './company';
import { generateShortCode, slugifyMinistryName } from './tokens';

function mapMinistry(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, nameAr: r.name_ar, token: r.token, contactEmail: r.contact_email,
        contactPhone: r.contact_phone, attentionName: r.attention_name, attentionTitle: r.attention_title,
        poBox: r.po_box, internalNote: r.internal_note, createdAt: r.created_at };
}
function mapItem(r) {
    return { id: r.id, itemNo: r.item_no, name: r.name, description: r.description, category: r.category,
        defaultQty: r.default_qty, qtyFixed: r.qty_fixed, unit: r.unit, unitPriceFils: r.unit_price_fils };
}
function mapQuote(r) {
    return { id: r.id, ministryId: r.ministry_id, ref: r.ref, eventName: r.event_name, venue: r.venue,
        eventDate: r.event_date, revision: r.revision, notes: r.notes, status: r.status,
        subtotalFils: r.subtotal_fils, vatFils: r.vat_fils, totalFils: r.total_fils,
        pdfBlobUrl: r.pdf_blob_url, createdAt: r.created_at };
}
function mapNote(r) {
    return { id: r.id, ministryId: r.ministry_id, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapPhoto(r) {
    return { id: r.id, ministryId: r.ministry_id, blobUrl: r.blob_url, pathname: r.pathname, caption: r.caption, uploadedAt: r.uploaded_at };
}
function fail(error) { if (error) throw new Error(error.message || String(error)); }

async function seedCatalogIfEmpty() {
    const db = getClient();
    const { count, error } = await db.from(T.catalog).select('id', { count: 'exact', head: true });
    fail(error);
    if ((count || 0) > 0) return;
    const rows = CATALOG.map((i, idx) => ({
        item_no: i.itemNo, name: i.name, description: i.description, category: i.category,
        default_qty: i.defaultQty, qty_fixed: isQtyFixed(i.itemNo), unit: i.unit,
        unit_price_fils: i.unitPriceFils, sort_order: idx, active: true,
    }));
    const { error: insErr } = await db.from(T.catalog).insert(rows);
    fail(insErr);
}

export async function getActiveCatalog() {
    await seedCatalogIfEmpty();
    const { data, error } = await getClient().from(T.catalog).select('*').eq('active', true).order('sort_order', { ascending: true });
    fail(error);
    return data.map(mapItem);
}

export async function getMinistryByToken(token) {
    const { data, error } = await getClient().from(T.ministries).select('*').eq('token', token).maybeSingle();
    fail(error);
    return mapMinistry(data);
}
export async function getMinistryById(id) {
    const { data, error } = await getClient().from(T.ministries).select('*').eq('id', id).maybeSingle();
    fail(error);
    return mapMinistry(data);
}
export async function getAllMinistries() {
    const { data, error } = await getClient().from(T.ministries).select('*').order('created_at', { ascending: false });
    fail(error);
    return data.map(mapMinistry);
}
export async function isTokenTaken(token, excludeId) {
    let q = getClient().from(T.ministries).select('id', { count: 'exact', head: true }).eq('token', token);
    if (excludeId) q = q.neq('id', excludeId);
    const { count, error } = await q;
    fail(error);
    return (count || 0) > 0;
}

/** Generate a unique short, readable code for a ministry (from its name, with a random fallback/suffix). */
export async function uniqueCodeForName(name, excludeId) {
    const base = slugifyMinistryName(name) || generateShortCode(6);
    if (!(await isTokenTaken(base, excludeId))) return base;
    for (let i = 2; i <= 9; i++) {
        const candidate = `${base}${i}`;
        if (!(await isTokenTaken(candidate, excludeId))) return candidate;
    }
    return `${base}-${generateShortCode(3)}`;
}

export async function createMinistry({ name, nameAr, contactEmail, contactPhone, attentionName, attentionTitle }) {
    const token = await uniqueCodeForName(name);
    const { data, error } = await getClient().from(T.ministries)
        .insert({
            name, name_ar: nameAr || null, contact_email: contactEmail || null, contact_phone: contactPhone || null,
            attention_name: attentionName || null, attention_title: attentionTitle || null, token,
        })
        .select('*').single();
    fail(error);
    return mapMinistry(data);
}
export async function updateMinistryDetails(id, d) {
    const { error } = await getClient().from(T.ministries).update({
        contact_phone: d.contactPhone || null,
        attention_name: d.attentionName || null, attention_title: d.attentionTitle || null,
        po_box: d.poBox || null, contact_email: d.contactEmail || null,
    }).eq('id', id);
    fail(error);
}
export async function deleteMinistryCascade(id) {
    const db = getClient();
    // Children that lack ON DELETE CASCADE must go first (lines -> quotations,
    // photos). Notes cascade automatically but we clear them explicitly too.
    const { data: quotes, error: qErr } = await db.from(T.quotations).select('id').eq('ministry_id', id);
    fail(qErr);
    const quoteIds = (quotes || []).map((q) => q.id);
    if (quoteIds.length) {
        const { error: lErr } = await db.from(T.lines).delete().in('quotation_id', quoteIds);
        fail(lErr);
    }
    const { error: delQErr } = await db.from(T.quotations).delete().eq('ministry_id', id);
    fail(delQErr);
    const { error: pErr } = await db.from(T.photos).delete().eq('ministry_id', id);
    fail(pErr);
    const { error: nErr } = await db.from(T.notes).delete().eq('ministry_id', id);
    fail(nErr);
    const { error: mErr } = await db.from(T.ministries).delete().eq('id', id);
    fail(mErr);
}
export async function regenerateToken(id) {
    const { error } = await getClient().from(T.ministries).update({ token: generateShortCode(6) }).eq('id', id);
    fail(error);
}
export async function setMinistryToken(id, token) {
    if (await isTokenTaken(token, id)) throw new Error('That link code is already in use.');
    const { error } = await getClient().from(T.ministries).update({ token }).eq('id', id);
    fail(error);
}

export async function getMinistryNotes(ministryId) {
    const { data, error } = await getClient().from(T.notes).select('*').eq('ministry_id', ministryId).order('created_at', { ascending: false });
    fail(error);
    return data.map(mapNote);
}
export async function addMinistryNote(ministryId, note) {
    const { error } = await getClient().from(T.notes).insert({ ministry_id: ministryId, note });
    fail(error);
}
export async function updateMinistryNote(ministryId, noteId, note) {
    const { error } = await getClient().from(T.notes).update({ note, updated_at: new Date().toISOString() }).eq('id', noteId).eq('ministry_id', ministryId);
    fail(error);
}
export async function deleteMinistryNote(ministryId, noteId) {
    const { error } = await getClient().from(T.notes).delete().eq('id', noteId).eq('ministry_id', ministryId);
    fail(error);
}

export async function getMinistryPhotos(ministryId) {
    const { data, error } = await getClient().from(T.photos).select('*').eq('ministry_id', ministryId).order('uploaded_at', { ascending: false });
    fail(error);
    return data.map(mapPhoto);
}
export async function getPhotoForMinistry(ministryId, photoId) {
    const { data, error } = await getClient().from(T.photos).select('*').eq('id', photoId).eq('ministry_id', ministryId).maybeSingle();
    fail(error);
    return data ? mapPhoto(data) : null;
}
export async function addPhoto(ministryId, blobUrl, pathname, caption) {
    const { error } = await getClient().from(T.photos).insert({ ministry_id: ministryId, blob_url: blobUrl, pathname: pathname || null, caption: caption || null });
    fail(error);
}
export async function deletePhoto(photoId) {
    const { error } = await getClient().from(T.photos).delete().eq('id', photoId);
    fail(error);
}

export async function getMinistryQuotations(ministryId) {
    const { data, error } = await getClient().from(T.quotations).select('*').eq('ministry_id', ministryId).order('created_at', { ascending: false });
    fail(error);
    return data.map(mapQuote);
}
export async function getQuotationForMinistry(ministryId, quotationId) {
    const { data, error } = await getClient().from(T.quotations).select('*').eq('id', quotationId).eq('ministry_id', ministryId).maybeSingle();
    fail(error);
    return data ? mapQuote(data) : null;
}
export async function nextQuotationRef(date = new Date()) {
    const { count, error } = await getClient().from(T.quotations).select('id', { count: 'exact', head: true });
    fail(error);
    const seq = String((count || 0) + 1).padStart(5, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${COMPANY.refPrefix}/${mm}/${date.getFullYear()}/${COMPANY.refDept}/${seq}`;
}
export async function createQuotation(q) {
    const { data, error } = await getClient().from(T.quotations).insert({
        ministry_id: q.ministryId, ref: q.ref, event_name: q.eventName || null, venue: q.venue || null,
        event_date: q.eventDate || null, revision: q.revision, status: 'submitted',
        subtotal_fils: q.subtotalFils, vat_fils: q.vatFils, total_fils: q.totalFils,
    }).select('*').single();
    fail(error);
    return mapQuote(data);
}
export async function insertQuotationLines(quotationId, lines) {
    const rows = lines.map((l) => ({
        quotation_id: quotationId, item_id: l.itemId, item_no: l.itemNo, name_snapshot: l.nameSnapshot,
        unit_price_fils_snapshot: l.unitPriceFilsSnapshot, qty: l.qty, line_total_fils: l.lineTotalFils,
    }));
    const { error } = await getClient().from(T.lines).insert(rows);
    fail(error);
}
export async function setQuotationPdfUrl(id, url) {
    const { error } = await getClient().from(T.quotations).update({ pdf_blob_url: url }).eq('id', id);
    fail(error);
}
export async function updateQuoteNotes(quoteId, notes, status) {
    const { error } = await getClient().from(T.quotations).update({ notes: notes || null, status: status || 'submitted' }).eq('id', quoteId);
    fail(error);
}
