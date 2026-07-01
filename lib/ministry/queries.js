import { query, ensureSchema } from './db';
import { CATALOG, isQtyFixed } from './catalog';
import { COMPANY } from './company';
import { generateToken } from './tokens';

function mapMinistry(r) {
    if (!r) return null;
    return { id: r.id, name: r.name, nameAr: r.name_ar, token: r.token, contactEmail: r.contact_email,
        attentionName: r.attention_name, attentionTitle: r.attention_title, poBox: r.po_box,
        internalNote: r.internal_note, createdAt: r.created_at };
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
function mapPhoto(r) {
    return { id: r.id, ministryId: r.ministry_id, blobUrl: r.blob_url, pathname: r.pathname, caption: r.caption, uploadedAt: r.uploaded_at };
}

async function seedCatalogIfEmpty() {
    const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM ministry.catalog_items`);
    if (count > 0) return;
    for (let idx = 0; idx < CATALOG.length; idx++) {
        const i = CATALOG[idx];
        await query(
            `INSERT INTO ministry.catalog_items (item_no,name,description,category,default_qty,qty_fixed,unit,unit_price_fils,sort_order,active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`,
            [i.itemNo, i.name, i.description, i.category, i.defaultQty, isQtyFixed(i.itemNo), i.unit, i.unitPriceFils, idx]
        );
    }
}

export async function getActiveCatalog() {
    await ensureSchema();
    await seedCatalogIfEmpty();
    const rows = await query(`SELECT * FROM ministry.catalog_items WHERE active = true ORDER BY sort_order ASC`);
    return rows.map(mapItem);
}

export async function getMinistryByToken(token) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.ministries WHERE token = $1 LIMIT 1`, [token]);
    return mapMinistry(rows[0]);
}
export async function getMinistryById(id) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.ministries WHERE id = $1 LIMIT 1`, [id]);
    return mapMinistry(rows[0]);
}
export async function getAllMinistries() {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.ministries ORDER BY created_at DESC`);
    return rows.map(mapMinistry);
}
export async function createMinistry({ name, nameAr, contactEmail }) {
    await ensureSchema();
    const rows = await query(
        `INSERT INTO ministry.ministries (name,name_ar,contact_email,token) VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, nameAr || null, contactEmail || null, generateToken()]
    );
    return mapMinistry(rows[0]);
}
export async function updateMinistryDetails(id, d) {
    await ensureSchema();
    await query(
        `UPDATE ministry.ministries SET attention_name=$2, attention_title=$3, po_box=$4, contact_email=$5, internal_note=$6 WHERE id=$1`,
        [id, d.attentionName || null, d.attentionTitle || null, d.poBox || null, d.contactEmail || null, d.internalNote || null]
    );
}
export async function regenerateToken(id) {
    await ensureSchema();
    await query(`UPDATE ministry.ministries SET token=$2 WHERE id=$1`, [id, generateToken()]);
}

export async function getMinistryPhotos(ministryId) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.ministry_photos WHERE ministry_id=$1 ORDER BY uploaded_at DESC`, [ministryId]);
    return rows.map(mapPhoto);
}
export async function getPhotoForMinistry(ministryId, photoId) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.ministry_photos WHERE id=$1 AND ministry_id=$2 LIMIT 1`, [photoId, ministryId]);
    return rows[0] ? mapPhoto(rows[0]) : null;
}
export async function addPhoto(ministryId, blobUrl, pathname, caption) {
    await ensureSchema();
    await query(`INSERT INTO ministry.ministry_photos (ministry_id,blob_url,pathname,caption) VALUES ($1,$2,$3,$4)`,
        [ministryId, blobUrl, pathname || null, caption || null]);
}
export async function deletePhoto(photoId) {
    await ensureSchema();
    await query(`DELETE FROM ministry.ministry_photos WHERE id=$1`, [photoId]);
}

export async function getMinistryQuotations(ministryId) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.quotations WHERE ministry_id=$1 ORDER BY created_at DESC`, [ministryId]);
    return rows.map(mapQuote);
}
export async function getQuotationForMinistry(ministryId, quotationId) {
    await ensureSchema();
    const rows = await query(`SELECT * FROM ministry.quotations WHERE id=$1 AND ministry_id=$2 LIMIT 1`, [quotationId, ministryId]);
    return rows[0] ? mapQuote(rows[0]) : null;
}
export async function nextQuotationRef(date = new Date()) {
    await ensureSchema();
    const [{ count }] = await query(`SELECT COUNT(*)::int AS count FROM ministry.quotations`);
    const seq = String(count + 1).padStart(5, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${COMPANY.refPrefix}/${mm}/${date.getFullYear()}/${COMPANY.refDept}/${seq}`;
}
export async function createQuotation(q) {
    await ensureSchema();
    const rows = await query(
        `INSERT INTO ministry.quotations (ministry_id,ref,event_name,venue,event_date,revision,status,subtotal_fils,vat_fils,total_fils)
         VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7,$8,$9) RETURNING *`,
        [q.ministryId, q.ref, q.eventName || null, q.venue || null, q.eventDate || null, q.revision, q.subtotalFils, q.vatFils, q.totalFils]
    );
    return mapQuote(rows[0]);
}
export async function insertQuotationLines(quotationId, lines) {
    await ensureSchema();
    for (const l of lines) {
        await query(
            `INSERT INTO ministry.quotation_lines (quotation_id,item_id,item_no,name_snapshot,unit_price_fils_snapshot,qty,line_total_fils)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [quotationId, l.itemId, l.itemNo, l.nameSnapshot, l.unitPriceFilsSnapshot, l.qty, l.lineTotalFils]
        );
    }
}
export async function setQuotationPdfUrl(id, url) {
    await ensureSchema();
    await query(`UPDATE ministry.quotations SET pdf_blob_url=$2 WHERE id=$1`, [id, url]);
}
export async function updateQuoteNotes(quoteId, notes, status) {
    await ensureSchema();
    await query(`UPDATE ministry.quotations SET notes=$2, status=$3 WHERE id=$1`, [quoteId, notes || null, status || 'submitted']);
}
