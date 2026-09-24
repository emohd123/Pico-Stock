import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// OSFam moved from osfam3.ossys.org to osfambh.ossys.org (same login). An env
// value still pointing at the retired host is redirected to the new one.
const OSFAM_DEFAULT_URL = 'https://osfambh.ossys.org';
const OSFAM_URL = (() => {
    const configured = (process.env.OSFAM_URL || '').trim().replace(/\/+$/, '');
    if (!configured || /osfam3\.ossys\.org/i.test(configured)) return OSFAM_DEFAULT_URL;
    return configured;
})();
const OSFAM_USER = process.env.OSFAM_USER || 'pico';
const OSFAM_PASS = process.env.OSFAM_PASS || 'picostock';
const STORAGE_BUCKET = 'product-images';

/**
 * Extract the asset code from a Pico product name.
 * e.g. "ID 1405 FGCTBL3 [6] Rectangular glass coffee table..."  → "FGCTBL3"
 */
function extractAssetCode(name) {
    if (!name) return null;
    const m = name.match(/^ID[\s\d;]+([A-Z][A-Z0-9]+)\s*\[/i);
    return m ? m[1].toUpperCase() : null;
}

/**
 * Extract the OSFam numeric asset IDs from a Pico product name.
 * e.g. "ID 1373 ;1374 FBEANBAGSB1 [25] ..." → ['1373', '1374']
 */
function extractAssetIds(name) {
    const m = String(name || '').match(/^ID([\s\d;]+)/i);
    return m ? m[1].split(/[\s;]+/).filter(Boolean) : [];
}

/**
 * Ensure the Supabase Storage bucket exists (public access).
 */
async function ensureBucket() {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: 10485760,
    });
    if (error && !error.message.toLowerCase().includes('already exist')) {
        console.warn('[sync-stock] Bucket create warning:', error.message);
    }
}

/**
 * Log into OSFam and return the asset map plus the session cookie.
 * { assetsById: { ID: { id, code, available, imgPath, assetId } },
 *   rowsByCode: { ASSETCODE: [row, ...] }, cookieHeader }
 * OSFam reuses asset codes across different items, so rows are keyed by their
 * unique numeric ID and codes map to every row that carries them.
 */
async function fetchOsfamAssets() {
    // 1. Get initial session cookie
    const initRes = await fetch(`${OSFAM_URL}/index.php`, { redirect: 'follow' });
    const rawCookie = initRes.headers.get('set-cookie') || '';
    const sessionMatch = rawCookie.match(/PHPSESSID=([^;,\s]+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : '';
    const cookieHeader = sessionId ? `PHPSESSID=${sessionId}` : '';

    // 2. POST login
    await fetch(`${OSFAM_URL}/index.php`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: new URLSearchParams({
            username: OSFAM_USER,
            password: OSFAM_PASS,
            login: 'SIGN IN',
        }),
        redirect: 'follow',
    });

    // 3. Fetch asset list
    const assetRes = await fetch(`${OSFAM_URL}/assetlist.php`, {
        headers: { ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
        redirect: 'follow',
    });

    if (!assetRes.ok) throw new Error(`OSFam returned HTTP ${assetRes.status}`);
    const html = await assetRes.text();

    // 4. Parse rows — extract assetCode, available qty, primary image, and numeric asset ID
    const assetsById = {};
    const rowsByCode = {};
    const rowRegex = /<tr\s+data-category[^>]*>([\s\S]*?)<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const rawRow = match[1];

        // Primary image src
        const imgMatch = rawRow.match(/src="(\.\/images\/[^"]+)"/);
        const imgPath = imgMatch ? imgMatch[1].replace(/^\.\//, '') : null;

        // Numeric asset ID from the edit link: edit-asset.php?edit=5121
        const assetIdMatch = rawRow.match(/edit-asset\.php\?edit=(\d+)/i);
        const assetId = assetIdMatch ? assetIdMatch[1] : null;

        // Text cells
        const cells = [...rawRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
            m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
        );

        if (cells.length >= 9) {
            const assetCode = (cells[2] || '').toUpperCase().trim();
            const available = parseInt(cells[8], 10);
            const osfamId = (cells[0] || '').trim();
            if (assetCode && /^\d+$/.test(osfamId) && !isNaN(available)) {
                const row = { id: osfamId, code: assetCode, available, imgPath, assetId: assetId || osfamId };
                assetsById[osfamId] = row;
                (rowsByCode[assetCode] ||= []).push(row);
            }
        }
    }

    if (Object.keys(assetsById).length === 0) {
        throw new Error('No assets parsed — login may have failed or page structure changed');
    }

    return { assetsById, rowsByCode, cookieHeader };
}

/**
 * Pick the OSFam row for a Pico product. Names look like
 * "ID 1373 ;1374 FBEANBAGSB1 [25] ...": the ID whose row carries the same code
 * wins; if the code has drifted (FIKEMTBL vs FIKEAMTBL) a single listed ID is
 * trusted; a bare code is only used when OSFam has exactly one row for it.
 */
function resolveOsfamRow(name, assetsById, rowsByCode) {
    const code = extractAssetCode(name);
    const idRows = extractAssetIds(name).map((id) => assetsById[id]).filter(Boolean);
    const exact = idRows.find((row) => row.code === code);
    if (exact) return { row: exact };
    if (idRows.length === 1) return { row: idRows[0] };
    if (idRows.length > 1) return { reason: 'several OSFam IDs, none with this code' };
    const byCode = code ? rowsByCode[code] || [] : [];
    if (byCode.length === 1) return { row: byCode[0] };
    if (byCode.length > 1) return { reason: `code ${code} is used by ${byCode.length} OSFam items and no ID matched` };
    return { reason: code ? 'not in OSFam' : 'no code in name' };
}

/**
 * Fetch the OSFam gallery page for a numeric asset ID and return all image paths.
 * e.g. /asset-images.php?edit=5121 → ['images/upload/abc.jpg', ...]
 */
async function fetchAssetGalleryPaths(assetId, cookieHeader) {
    if (!assetId) return [];
    try {
        const res = await fetch(`${OSFAM_URL}/asset-images.php?edit=${assetId}`, {
            headers: { ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
            redirect: 'follow',
        });
        if (!res.ok) return [];
        const html = await res.text();

        // Parse all image srcs — gallery images use src="./images/ASSETID-TIMESTAMP.jpg"
        const matches = [...html.matchAll(/src="([^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi)];
        const paths = matches
            .map(m => m[1].replace(/^\.[\\/]/, '').replace(/\\/g, '/'))
            .filter(p =>
                !p.startsWith('img/') &&
                !p.startsWith('template/') &&
                !p.includes('logo') &&
                !p.includes('icon') &&
                !p.includes('gravatar')
            );

        // Deduplicate while preserving order
        return [...new Set(paths)];
    } catch (err) {
        console.warn(`[sync-stock] Gallery fetch failed for asset ${assetId}:`, err.message);
        return [];
    }
}

/**
 * Download an OSFam image and upload it to Supabase Storage.
 * Returns the public URL, or null on failure.
 * Uses upsert:false — skips upload if already stored.
 */
async function uploadImageToSupabase(imgPath, storageKey, currentUrl) {
    try {
        if (!imgPath) return null;

        const extMatch = imgPath.match(/\.[^./?#]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
        const storagePath = `osfam/${storageKey}${ext}`;

        const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl;

        // Already stored and product points to it — nothing to do
        if (currentUrl && publicUrl && currentUrl === publicUrl) {
            return publicUrl;
        }

        const res = await fetch(`${OSFAM_URL}/${imgPath}`);
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();

        const contentType = ext === '.png' ? 'image/png'
            : ext === '.gif' ? 'image/gif'
            : 'image/jpeg';

        const { error: uploadErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, Buffer.from(buffer), { contentType, upsert: false });

        if (uploadErr && !uploadErr.message.toLowerCase().includes('already exist')) {
            console.warn(`[sync-stock] Upload failed for ${storageKey}:`, uploadErr.message);
            return null;
        }

        return publicUrl || null;
    } catch (err) {
        console.warn(`[sync-stock] Image error for ${storageKey}:`, err.message);
        return null;
    }
}

export async function POST() {
    try {
        await ensureBucket();

        // Login once and reuse the session for all subsequent requests
        const { assetsById, rowsByCode, cookieHeader } = await fetchOsfamAssets();

        // Get all Pico products
        const { data: products, error: fetchErr } = await supabase
            .from('products')
            .select('id, name, stock, image, gallery');
        if (fetchErr) throw fetchErr;

        const toUpdate = [];
        const skipped = [];

        for (const product of products) {
            const { row, reason } = resolveOsfamRow(product.name, assetsById, rowsByCode);
            if (!row) {
                skipped.push({ id: product.id, name: product.name, reason });
                continue;
            }

            const { code, available: newStock, imgPath, assetId } = row;
            // Shared codes get the OSFam ID in the storage key so two items never
            // overwrite each other's photos.
            const imageKey = (rowsByCode[code] || []).length > 1 ? `${code}-${row.id}` : code;

            // Upload primary image
            let newImage = product.image;
            if (imgPath) {
                const uploaded = await uploadImageToSupabase(imgPath, imageKey, product.image);
                if (uploaded) newImage = uploaded;
            }

            // Fetch the real gallery from asset-images.php and upload each image
            const galleryPaths = await fetchAssetGalleryPaths(assetId, cookieHeader);
            const galleryUrls = [];
            for (let i = 0; i < galleryPaths.length; i++) {
                const gPath = galleryPaths[i];
                // Use a stable key based on asset code + index so reruns skip re-uploads
                const fileBasename = gPath.split('/').pop().replace(/\.[^.]+$/, '');
                const storageKey = `${imageKey}_gallery_${fileBasename}`;
                const uploaded = await uploadImageToSupabase(gPath, storageKey, null);
                if (uploaded) galleryUrls.push(uploaded);
            }

            const currentGallery = Array.isArray(product.gallery) ? product.gallery : [];
            const stockChanged = newStock !== product.stock;
            const imageChanged = newImage !== product.image;
            const galleryChanged = galleryUrls.length > 0 &&
                JSON.stringify(galleryUrls) !== JSON.stringify(currentGallery);

            toUpdate.push({
                id: product.id,
                code,
                name: product.name,
                oldStock: product.stock,
                newStock,
                stockChanged,
                oldImage: product.image,
                newImage,
                imageChanged,
                newGallery: galleryUrls,
                galleryChanged,
                changed: stockChanged || imageChanged || galleryChanged,
            });
        }

        // Apply updates
        const changed = toUpdate.filter(u => u.changed);
        let updatedCount = 0;
        const errors = [];

        for (const u of changed) {
            const updatePayload = {};
            if (u.stockChanged) {
                updatePayload.stock = u.newStock;
                updatePayload.in_stock = u.newStock > 0;
            }
            if (u.imageChanged) {
                updatePayload.image = u.newImage;
            }
            if (u.galleryChanged) {
                updatePayload.gallery = u.newGallery;
            }

            const { error } = await supabase
                .from('products')
                .update(updatePayload)
                .eq('id', u.id);

            if (error) errors.push({ id: u.id, error: error.message });
            else updatedCount++;
        }

        const stockUpdates = changed.filter(u => u.stockChanged).length;
        const imageUpdates = changed.filter(u => u.imageChanged).length;
        const galleryUpdates = changed.filter(u => u.galleryChanged).length;

        return NextResponse.json({
            success: true,
            osfamAssets: Object.keys(assetsById).length,
            picoProducts: products.length,
            matched: toUpdate.length,
            changed: changed.length,
            updated: updatedCount,
            stockUpdates,
            imageUpdates,
            galleryUpdates,
            errors,
            skipped,
            details: toUpdate,
        });

    } catch (err) {
        console.error('[sync-stock] Error:', err);
        return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
    }
}
