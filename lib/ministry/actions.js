'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAdmin } from './auth';
import { delPrivate } from './storage';
import { createMinistry, updateMinistryDetails, regenerateToken, setMinistryToken, getPhotoForMinistry, deletePhoto, updateQuoteNotes, addMinistryNote, updateMinistryNote, deleteMinistryNote, getMinistryPhotos, deleteMinistryCascade, getQuotationForMinistry, deleteQuotationCascade, setMinistryCover, setMinistryQuoteNumber, logActivity } from './queries';
import { normalizeLinkCode, isValidLinkCode } from './tokens';

function assertAdmin() { if (!isAdmin()) throw new Error('Unauthorized'); }

// Finish a ministry-page action: refresh data and surface success / a friendly
// error banner instead of Next's generic error page.
function finish(id, error) {
    revalidatePath(`/quotations/ministry/${id}`);
    redirect(`/quotations/ministry/${id}?${error ? `error=${encodeURIComponent(error)}` : 'saved=1'}`);
}

export async function createMinistryAction(formData) {
    assertAdmin();
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new Error('Name is required');
    const row = await createMinistry({
        name,
        nameAr: String(formData.get('nameAr') || '').trim(),
        contactEmail: String(formData.get('contactEmail') || '').trim(),
        contactPhone: String(formData.get('contactPhone') || '').trim(),
        attentionName: String(formData.get('attentionName') || '').trim(),
        attentionTitle: String(formData.get('attentionTitle') || '').trim(),
    });
    revalidatePath('/quotations');
    redirect(`/quotations/ministry/${row.id}`);
}

export async function setQuoteNumberAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    const raw = String(formData.get('quoteNumber') || '').trim();
    let error = null;
    if (raw && !/^\d{1,9}$/.test(raw)) {
        error = 'Quotation number must be digits only (e.g. 11968).';
    } else {
        try { await setMinistryQuoteNumber(id, raw); } catch (e) { error = e.message || 'Could not save quotation number.'; }
    }
    finish(id, error);
}

export async function updateMinistryAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    let error = null;
    try {
        await updateMinistryDetails(id, {
            attentionName: String(formData.get('attentionName') || '').trim(),
            attentionTitle: String(formData.get('attentionTitle') || '').trim(),
            poBox: String(formData.get('poBox') || '').trim(),
            contactEmail: String(formData.get('contactEmail') || '').trim(),
            contactPhone: String(formData.get('contactPhone') || '').trim(),
        });
    } catch (e) { error = e.message || 'Could not save details.'; }
    finish(id, error);
}

export async function addMinistryNoteAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    const note = String(formData.get('note') || '').trim();
    if (!note) finish(id, 'Note cannot be empty.');
    let error = null;
    try {
        await addMinistryNote(id, note);
        await logActivity({ ministryId: id, actor: 'admin', action: 'note.added', detail: `Project note: ${note}` });
    } catch (e) { error = e.message || 'Could not add note.'; }
    finish(id, error);
}

export async function updateMinistryNoteAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    const noteId = Number(formData.get('noteId'));
    const note = String(formData.get('note') || '').trim();
    if (!note) finish(id, 'Note cannot be empty.');
    let error = null;
    try { await updateMinistryNote(id, noteId, note); } catch (e) { error = e.message || 'Could not update note.'; }
    finish(id, error);
}

export async function deleteMinistryNoteAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    const noteId = Number(formData.get('noteId'));
    let error = null;
    try { await deleteMinistryNote(id, noteId); } catch (e) { error = e.message || 'Could not delete note.'; }
    finish(id, error);
}

export async function deleteMinistryAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    // Best-effort: remove stored photo blobs before dropping the DB rows.
    try {
        const photos = await getMinistryPhotos(id);
        for (const p of photos) {
            try { await delPrivate(p.blobUrl); } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    await deleteMinistryCascade(id);
    revalidatePath('/quotations');
    redirect('/quotations');
}

export async function regenerateTokenAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    await regenerateToken(id);
    revalidatePath(`/quotations/ministry/${id}`);
}

export async function updateLinkCodeAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    const code = normalizeLinkCode(formData.get('code'));
    if (!isValidLinkCode(code)) {
        finish(id, 'Link code must be 3-24 lowercase letters, numbers, or hyphens.');
    }
    let error = null;
    try { await setMinistryToken(id, code); } catch (e) { error = e.message || 'Could not save link code.'; }
    finish(id, error);
}

export async function deletePhotoAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const photoId = Number(formData.get('photoId'));
    const photo = await getPhotoForMinistry(ministryId, photoId);
    if (photo) {
        await logActivity({
            ministryId, actor: 'admin', action: 'photo.deleted',
            detail: 'Gallery photo removed' + (photo.caption ? ` — ${photo.caption}` : ''),
        });
        try { await delPrivate(photo.blobUrl); } catch { /* ignore */ }
        await deletePhoto(photoId);
    }
    revalidatePath(`/quotations/ministry/${ministryId}`);
}

export async function setCoverAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const photoId = Number(formData.get('photoId'));
    // Confirm the photo belongs to this ministry before pinning it.
    const photo = await getPhotoForMinistry(ministryId, photoId);
    if (photo) await setMinistryCover(ministryId, photoId);
    revalidatePath('/quotations/albums');
    revalidatePath('/quotations');
}

export async function updateQuoteNotesAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const quoteId = Number(formData.get('quoteId'));
    await updateQuoteNotes(quoteId, String(formData.get('notes') || '').trim(), String(formData.get('status') || 'submitted').trim());
    revalidatePath(`/quotations/ministry/${ministryId}`);
}

export async function deleteQuotationAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const quoteId = Number(formData.get('quoteId'));
    const quote = await getQuotationForMinistry(ministryId, quoteId);
    if (quote) {
        // Logged BEFORE the delete: once the row is gone there is nothing left
        // to reconstruct it from, and a removal is exactly what an evidence
        // trail has to keep.
        await logActivity({
            ministryId, quotationId: quoteId, actor: 'admin', action: 'quotation.deleted',
            detail: `Quotation ${quote.ref} (rev ${quote.revision}) deleted`
                + ` · BHD ${(quote.totalFils / 1000).toFixed(3)}`,
        });
        if (quote.pdfBlobUrl) { try { await delPrivate(quote.pdfBlobUrl); } catch { /* ignore */ } }
        await deleteQuotationCascade(quoteId);
    }
    revalidatePath(`/quotations/ministry/${ministryId}`);
}
