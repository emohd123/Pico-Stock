'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isAdmin } from './auth';
import { delPrivate } from './storage';
import { createMinistry, updateMinistryDetails, regenerateToken, getPhotoForMinistry, deletePhoto, updateQuoteNotes } from './queries';

function assertAdmin() { if (!isAdmin()) throw new Error('Unauthorized'); }

export async function createMinistryAction(formData) {
    assertAdmin();
    const name = String(formData.get('name') || '').trim();
    if (!name) throw new Error('Name is required');
    const row = await createMinistry({
        name,
        nameAr: String(formData.get('nameAr') || '').trim(),
        contactEmail: String(formData.get('contactEmail') || '').trim(),
    });
    revalidatePath('/quotations');
    redirect(`/quotations/ministry/${row.id}`);
}

export async function updateMinistryAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    await updateMinistryDetails(id, {
        attentionName: String(formData.get('attentionName') || '').trim(),
        attentionTitle: String(formData.get('attentionTitle') || '').trim(),
        poBox: String(formData.get('poBox') || '').trim(),
        contactEmail: String(formData.get('contactEmail') || '').trim(),
        internalNote: String(formData.get('internalNote') || '').trim(),
    });
    revalidatePath(`/quotations/ministry/${id}`);
}

export async function regenerateTokenAction(formData) {
    assertAdmin();
    const id = Number(formData.get('ministryId'));
    await regenerateToken(id);
    revalidatePath(`/quotations/ministry/${id}`);
}

export async function deletePhotoAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const photoId = Number(formData.get('photoId'));
    const photo = await getPhotoForMinistry(ministryId, photoId);
    if (photo) {
        try { await delPrivate(photo.blobUrl); } catch { /* ignore */ }
        await deletePhoto(photoId);
    }
    revalidatePath(`/quotations/ministry/${ministryId}`);
}

export async function updateQuoteNotesAction(formData) {
    assertAdmin();
    const ministryId = Number(formData.get('ministryId'));
    const quoteId = Number(formData.get('quoteId'));
    await updateQuoteNotes(quoteId, String(formData.get('notes') || '').trim(), String(formData.get('status') || 'submitted').trim());
    revalidatePath(`/quotations/ministry/${ministryId}`);
}
