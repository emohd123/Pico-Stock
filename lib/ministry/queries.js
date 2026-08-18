import { getClient, T } from './db';
import { CATALOG, isQtyFixed } from './catalog';
import { COMPANY } from './company';
import { generateShortCode, slugifyMinistryName } from './tokens';

function mapMinistry(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, nameAr: r.name_ar, token: r.token, contactEmail: r.contact_email,
        contactPhone: r.contact_phone, attentionName: r.attention_name, attentionTitle: r.attention_title,
        poBox: r.po_box, internalNote: r.internal_note, coverPhotoId: r.cover_photo_id, createdAt: r.created_at,
        quoteRef: r.quote_ref, quoteSeq: r.quote_seq, lpoReceived: Boolean(r.lpo_received),
        lpoBlobUrl: r.lpo_blob_url, lpoFileName: r.lpo_file_name,
        lpoSizeBytes: r.lpo_size_bytes, lpoUploadedAt: r.lpo_uploaded_at,
        presentationUrl: r.presentation_url, presentationRef: r.presentation_ref, presentationAt: r.presentation_at };
}
// Strip the word "Approx"/"Approx." from a description wherever it appears, so
// the portal and PDF never show it even if an older DB row still contains it.
function stripApprox(desc) {
    if (!desc) return desc;
    return desc.replace(/\bapprox\.?\s*/gi, '').replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').trim();
}
// catalog.js is the source of truth for quantities/prices, so the portal is
// correct even if a stored catalog row is stale (fall back to the DB value only
// when an item isn't in the code catalog).
const CATALOG_BY_NO = new Map(CATALOG.map((c) => [c.itemNo, c]));
function mapItem(r) {
    const c = CATALOG_BY_NO.get(r.item_no);
    return { id: r.id, itemNo: r.item_no, name: r.name, description: stripApprox(r.description), category: r.category,
        defaultQty: c ? c.defaultQty : r.default_qty, qtyFixed: isQtyFixed(r.item_no),
        unit: c ? c.unit : r.unit, unitPriceFils: c ? c.unitPriceFils : r.unit_price_fils };
}
function mapQuote(r) {
    return { id: r.id, ministryId: r.ministry_id, ref: r.ref, eventName: r.event_name, venue: r.venue,
        eventDate: r.event_date, duration: r.duration, revision: r.revision, notes: r.notes, status: r.status,
        termsAgreedAt: r.terms_agreed_at, submitterNote: r.submitter_note,
        subtotalFils: r.subtotal_fils, vatFils: r.vat_fils, totalFils: r.total_fils,
        pdfBlobUrl: r.pdf_blob_url, productionNote: r.production_note, shareToken: r.share_token,
        // A side meeting runs in its own room alongside the main one, so it is
        // never the same build even at the same hotel on the same day.
        meetingKind: r.meeting_kind === 'side' ? 'side' : 'main', hall: r.hall || '',
        // Printed on the quotation, and needed again to reopen it for editing.
        address: r.address || '', heads: r.heads || null,
        contact1: { name: r.contact1_name || '', title: r.contact1_title || '', phone: r.contact1_phone || '', email: r.contact1_email || '' },
        contact2: { name: r.contact2_name || '', title: r.contact2_title || '', phone: r.contact2_phone || '', email: r.contact2_email || '' },
        createdAt: r.created_at };
}
function mapNote(r) {
    return { id: r.id, ministryId: r.ministry_id, note: r.note, createdAt: r.created_at, updatedAt: r.updated_at,
        fileUrl: r.file_url, fileName: r.file_name, fileType: r.file_type, fileSizeBytes: r.file_size_bytes,
        showToProduction: Boolean(r.show_to_production) };
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
// A note can carry one file — the layout, the artwork, the email that was
// promised. `showToProduction` decides whether the crew's share link lists it.
export async function setMinistryNoteFile(ministryId, noteId, file) {
    const update = file
        ? { file_url: file.url, file_name: file.name, file_type: file.type || null, file_size_bytes: file.size || null }
        : { file_url: null, file_name: null, file_type: null, file_size_bytes: null, show_to_production: false };
    const { error } = await getClient().from(T.notes).update(update).eq('id', noteId).eq('ministry_id', ministryId);
    fail(error);
}
export async function setMinistryNoteShared(ministryId, noteId, shared) {
    const { error } = await getClient().from(T.notes)
        .update({ show_to_production: Boolean(shared) }).eq('id', noteId).eq('ministry_id', ministryId);
    fail(error);
}
// The subset production is allowed to see, for the shared sheet.
export async function getSharedNoteFiles(ministryId) {
    const { data, error } = await getClient().from(T.notes).select('*')
        .eq('ministry_id', ministryId).eq('show_to_production', true).not('file_url', 'is', null)
        .order('created_at', { ascending: false });
    fail(error);
    return (data || []).map(mapNote);
}
export async function getMinistryNote(noteId) {
    const { data, error } = await getClient().from(T.notes).select('*').eq('id', noteId).limit(1);
    fail(error);
    return data && data.length ? mapNote(data[0]) : null;
}

export async function getMinistryPhotos(ministryId) {
    const { data, error } = await getClient().from(T.photos).select('*').eq('ministry_id', ministryId).order('uploaded_at', { ascending: false });
    fail(error);
    return data.map(mapPhoto);
}
// Choose which photo backs an album's cover band. Priority: the admin-pinned
// cover (if it still exists), otherwise the FIRST photo ever uploaded (oldest).
// Using the oldest — not photos[0], which is newest-first — keeps the cover
// stable when more photos are added later.
export function pickCoverPhotoId(coverPhotoId, photos) {
    if (!photos || !photos.length) return null;
    if (coverPhotoId != null && photos.some((p) => String(p.id) === String(coverPhotoId))) return coverPhotoId;
    let oldest = photos[0];
    for (const p of photos) if (new Date(p.uploadedAt) < new Date(oldest.uploadedAt)) oldest = p;
    return oldest.id;
}
export async function setMinistryCover(ministryId, photoId) {
    const { error } = await getClient().from(T.ministries).update({ cover_photo_id: photoId }).eq('id', ministryId);
    fail(error);
}
export async function getPhotoForMinistry(ministryId, photoId) {
    const { data, error } = await getClient().from(T.photos).select('*').eq('id', photoId).eq('ministry_id', ministryId).maybeSingle();
    fail(error);
    return data ? mapPhoto(data) : null;
}
// Any photo by id — used by the shared (cross-ministry) event gallery.
export async function getPhotoById(photoId) {
    const { data, error } = await getClient().from(T.photos).select('*').eq('id', photoId).maybeSingle();
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
// Recent submissions across all ministries — powers the admin activity feed.
export async function getRecentQuotations(limit = 20) {
    const { data, error } = await getClient().from(T.quotations).select('*').order('created_at', { ascending: false }).limit(limit);
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

/**
 * Return the ministry's permanent quotation number, reserving one on first use.
 * The same ministry always reuses the same number (revisions bump instead of the
 * number). Returns { ref, seq, isNew } — isNew is true only the first time.
 */
export async function reserveMinistryQuoteRef(ministryId, date = new Date()) {
    const db = getClient();
    const { data: m, error } = await db.from(T.ministries).select('quote_ref, quote_seq').eq('id', ministryId).single();
    fail(error);
    if (m && m.quote_ref) return { ref: m.quote_ref, seq: m.quote_seq, isNew: false };

    const { data: rows, error: maxErr } = await db.from(T.ministries).select('quote_seq').not('quote_seq', 'is', null).order('quote_seq', { ascending: false }).limit(1);
    fail(maxErr);
    // Continue the manually-maintained plain number series (e.g. 11934 -> 11935).
    const seq = ((rows && rows[0] && rows[0].quote_seq) || 0) + 1;
    const ref = String(seq);
    const { error: updErr } = await db.from(T.ministries).update({ quote_ref: ref, quote_seq: seq }).eq('id', ministryId);
    fail(updErr);
    return { ref, seq, isNew: true };
}
export async function createQuotation(q) {
    const { data, error } = await getClient().from(T.quotations).insert({
        ministry_id: q.ministryId, ref: q.ref, event_name: q.eventName || null, venue: q.venue || null,
        event_date: q.eventDate || null, duration: q.duration || null, revision: q.revision, status: 'submitted',
        terms_agreed_at: q.termsAgreedAt || null, submitter_note: q.submitterNote || null,
        meeting_kind: q.meetingKind === 'side' ? 'side' : 'main', hall: q.hall || null,
        address: q.address || null, heads: q.heads || null,
        contact1_name: q.contact1?.name || null, contact1_title: q.contact1?.title || null,
        contact1_phone: q.contact1?.phone || null, contact1_email: q.contact1?.email || null,
        contact2_name: q.contact2?.name || null, contact2_title: q.contact2?.title || null,
        contact2_phone: q.contact2?.phone || null, contact2_email: q.contact2?.email || null,
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
// Quotation ids that include a given catalog item (e.g. 6 = Head Table, of
// which PICO owns exactly one — used to flag same-day clashes).
export async function getQuotationIdsWithItem(itemNo) {
    const { data, error } = await getClient().from(T.lines).select('quotation_id').eq('item_no', itemNo);
    fail(error);
    return new Set((data || []).map((r) => r.quotation_id));
}
// Bulk lines for many quotations in one round trip (Production page).
// Returns Map<quotationId, [{itemNo, nameSnapshot, qty}]> sorted by item_no.
export async function getQuotationLinesBulk(quotationIds) {
    const map = new Map();
    for (let i = 0; i < quotationIds.length; i += 200) {
        const chunk = quotationIds.slice(i, i + 200);
        const { data, error } = await getClient().from(T.lines)
            .select('quotation_id, item_no, name_snapshot, qty')
            .in('quotation_id', chunk).order('item_no', { ascending: true });
        fail(error);
        for (const r of data || []) {
            if (!map.has(r.quotation_id)) map.set(r.quotation_id, []);
            map.get(r.quotation_id).push({ itemNo: r.item_no, nameSnapshot: r.name_snapshot, qty: r.qty });
        }
    }
    return map;
}
// Per-quotation-item department overrides for the Production page.
// Map "<quotationId>:<itemNo>" -> { dept, title }. dept may be null when only a
// title was ever saved; callers fall back to deptForItem(itemNo).
export async function getProductionAssignments(quotationIds) {
    const map = new Map();
    if (!quotationIds.length) return map;
    const { data, error } = await getClient().from(T.production).select('*').in('quotation_id', quotationIds);
    fail(error);
    for (const r of data || []) {
        map.set(`${r.quotation_id}:${r.item_no}`, {
            dept: r.dept, title: r.title || '', selections: r.selections || [],
            clientNote: r.client_note || '',
        });
    }
    return map;
}
export async function setProductionAssignment(quotationId, itemNo, dept) {
    const { error } = await getClient().from(T.production)
        .upsert({ quotation_id: quotationId, item_no: itemNo, dept }, { onConflict: 'quotation_id,item_no' });
    fail(error);
}
// What the client asked for on this specific item — a colour, a spelling, an
// extra unit. Upserts only its own column so it never clobbers a department
// override or a title.
export async function setProductionClientNote(quotationId, itemNo, note) {
    const { error } = await getClient().from(T.production)
        .upsert({ quotation_id: quotationId, item_no: itemNo, client_note: note || null }, { onConflict: 'quotation_id,item_no' });
    fail(error);
}
// Upserts only the title column, so it never clobbers a department override.
export async function setProductionTitle(quotationId, itemNo, title) {
    const { error } = await getClient().from(T.production)
        .upsert({ quotation_id: quotationId, item_no: itemNo, title: title || null }, { onConflict: 'quotation_id,item_no' });
    fail(error);
}
// Likewise column-scoped: which plates / flags an item needs (see PICK_LISTS).
export async function setProductionSelections(quotationId, itemNo, values) {
    const { error } = await getClient().from(T.production)
        .upsert({ quotation_id: quotationId, item_no: itemNo, selections: values && values.length ? values : null }, { onConflict: 'quotation_id,item_no' });
    fail(error);
}
// Venue is stored per quotation (it is printed on the document), so deciding a
// meeting's venue means writing it to every quotation for that meeting —
// otherwise the planner would still see the old value on the other revision and
// keep warning about a clash that has been resolved.
export async function setQuotationVenues(quotationIds, venue) {
    const ids = (quotationIds || []).map(Number).filter(Boolean);
    if (!ids.length) return 0;
    const { error } = await getClient().from(T.quotations).update({ venue: venue || null }).in('id', ids);
    fail(error);
    return ids.length;
}

// Main or side, and which room — set on upload and correctable afterwards.
export async function setQuotationMeeting(quotationId, { kind, hall }) {
    const patch = {};
    if (kind !== undefined) patch.meeting_kind = kind === 'side' ? 'side' : 'main';
    if (hall !== undefined) patch.hall = String(hall || '').slice(0, 120) || null;
    if (!Object.keys(patch).length) return;
    const { error } = await getClient().from(T.quotations).update(patch).eq('id', quotationId);
    fail(error);
}
export async function setProductionNote(quotationId, note) {
    const { error } = await getClient().from(T.quotations).update({ production_note: note || null }).eq('id', quotationId);
    fail(error);
}

// --- Activity log ---
//
// Append-only evidence of what happened on a ministry's portal. Every write is
// best-effort: a failure to log must never stop the action the user asked for,
// because a missing log line is a smaller problem than a quotation that would
// not save.
export async function logActivity({ ministryId, quotationId = null, actor, action, detail = null }) {
    if (!ministryId || !actor || !action) return;
    try {
        const { error } = await getClient().from(T.activity).insert({
            ministry_id: ministryId, quotation_id: quotationId,
            actor, action, detail: detail ? String(detail).slice(0, 500) : null,
        });
        if (error) console.error('activity log failed', action, error.message);
    } catch (e) {
        console.error('activity log failed', action, e && e.message);
    }
}

function mapActivity(r) {
    return { id: r.id, ministryId: r.ministry_id, quotationId: r.quotation_id, actor: r.actor,
        action: r.action, detail: r.detail, reconstructed: r.reconstructed, createdAt: r.created_at };
}
export async function getActivity({ ministryId = null, limit = 500 } = {}) {
    let q = getClient().from(T.activity).select('*').order('created_at', { ascending: false }).limit(limit);
    if (ministryId) q = q.eq('ministry_id', ministryId);
    const { data, error } = await q;
    fail(error);
    return (data || []).map(mapActivity);
}

// --- Read-only production share link (handed to suppliers / production crew) ---

// Long random code: this link is unauthenticated, so it has to be unguessable.
export async function createShareToken(quotationId) {
    const token = generateShortCode(16);
    const { error } = await getClient().from(T.quotations).update({ share_token: token }).eq('id', quotationId);
    fail(error);
    return token;
}
export async function revokeShareToken(quotationId) {
    const { error } = await getClient().from(T.quotations).update({ share_token: null }).eq('id', quotationId);
    fail(error);
}
// Quotation by id alone — used where the caller only has the id (activity log,
// share-link routes) and still needs the ministry it belongs to.
export async function getQuotationById(quotationId) {
    const { data, error } = await getClient().from(T.quotations).select('*').eq('id', quotationId).limit(1);
    fail(error);
    return data && data.length ? mapQuote(data[0]) : null;
}
export async function getQuotationByShareToken(token) {
    const { data, error } = await getClient().from(T.quotations).select('*').eq('share_token', token).limit(1);
    fail(error);
    return data && data.length ? mapQuote(data[0]) : null;
}

// --- App-wide settings (one key/value row each) ---

export async function getSetting(key) {
    const { data, error } = await getClient().from(T.settings).select('value').eq('key', key).limit(1);
    fail(error);
    return data && data.length ? data[0].value : null;
}
export async function setSetting(key, value) {
    const { error } = await getClient().from(T.settings)
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    fail(error);
}

// The season plan's read-only link for management. Minted once and then left
// alone: a link already sitting in somebody inbox has to keep working, so this
// only generates a token when none exists yet.
const PLAN_SHARE_KEY = 'plan_share_token';
export async function getPlanShareToken() {
    const existing = await getSetting(PLAN_SHARE_KEY);
    if (existing) return existing;
    const token = generateShortCode(18);
    await setSetting(PLAN_SHARE_KEY, token);
    return token;
}
export async function planShareTokenValid(token) {
    if (!token) return false;
    const current = await getSetting(PLAN_SHARE_KEY);
    return Boolean(current) && current === token;
}

// --- Files published for a meeting (logo, artwork, layouts) ---

function mapProductionFile(r) {
    return { id: r.id, quotationId: r.quotation_id, name: r.name, blobUrl: r.blob_url,
        contentType: r.content_type, sizeBytes: r.size_bytes, createdAt: r.created_at };
}
export async function addProductionFile(quotationId, { name, blobUrl, pathname, contentType, sizeBytes }) {
    const { error } = await getClient().from(T.productionFiles).insert({
        quotation_id: quotationId, name, blob_url: blobUrl, blob_path: pathname || null,
        content_type: contentType || null, size_bytes: sizeBytes || null,
    });
    fail(error);
}
export async function getProductionFiles(quotationIds) {
    const map = new Map();
    if (!quotationIds.length) return map;
    const { data, error } = await getClient().from(T.productionFiles)
        .select('*').in('quotation_id', quotationIds).order('id', { ascending: true });
    fail(error);
    for (const r of data || []) {
        if (!map.has(r.quotation_id)) map.set(r.quotation_id, []);
        map.get(r.quotation_id).push(mapProductionFile(r));
    }
    return map;
}
export async function getProductionFile(fileId) {
    const { data, error } = await getClient().from(T.productionFiles).select('*').eq('id', fileId).limit(1);
    fail(error);
    return data && data.length ? mapProductionFile(data[0]) : null;
}
export async function deleteProductionFile(fileId) {
    const { error } = await getClient().from(T.productionFiles).delete().eq('id', fileId);
    fail(error);
}
export async function getQuotationLines(quotationId) {
    const { data, error } = await getClient().from(T.lines).select('*').eq('quotation_id', quotationId).order('item_no', { ascending: true });
    fail(error);
    return data.map((r) => ({ id: r.id, itemNo: r.item_no, nameSnapshot: r.name_snapshot, qty: r.qty, unitPriceFils: r.unit_price_fils_snapshot, lineTotalFils: r.line_total_fils }));
}
// Admin sets the ministry's permanent quotation number by hand. The next
// generated quotation reuses it (reserveMinistryQuoteRef returns it as-is).
// Pass null/empty to clear and let the next quote auto-assign.
export async function setMinistryQuoteNumber(ministryId, number) {
    const n = number == null || number === '' ? null : parseInt(number, 10);
    const update = (n && n > 0)
        ? { quote_ref: String(n), quote_seq: n }
        : { quote_ref: null, quote_seq: null };
    const { error } = await getClient().from(T.ministries).update(update).eq('id', ministryId);
    fail(error);
}
// Admin marks the LPO (purchase order) as received for a ministry; its calendar
// dates turn from booked (green) to confirmed (red).
export async function setMinistryLpo(ministryId, received) {
    const { error } = await getClient().from(T.ministries).update({ lpo_received: Boolean(received) }).eq('id', ministryId);
    fail(error);
}
// The LPO document itself, stored alongside the tick so it can be read back
// later — "was it actually received" is a question the checkbox alone answers
// with nothing to show.
export async function setMinistryLpoFile(ministryId, file) {
    const update = file
        ? { lpo_blob_url: file.url, lpo_file_name: file.name, lpo_size_bytes: file.size, lpo_uploaded_at: new Date().toISOString() }
        : { lpo_blob_url: null, lpo_file_name: null, lpo_size_bytes: null, lpo_uploaded_at: null };
    const { error } = await getClient().from(T.ministries).update(update).eq('id', ministryId);
    fail(error);
}
export async function setMinistryPresentation(ministryId, url, ref) {
    const { error } = await getClient().from(T.ministries).update({ presentation_url: url, presentation_ref: ref, presentation_at: new Date().toISOString() }).eq('id', ministryId);
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
export async function deleteQuotationCascade(quoteId) {
    const db = getClient();
    const { error: lErr } = await db.from(T.lines).delete().eq('quotation_id', quoteId);
    fail(lErr);
    const { error: qErr } = await db.from(T.quotations).delete().eq('id', quoteId);
    fail(qErr);
}
