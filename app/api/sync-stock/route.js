import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const OSFAM_URL = process.env.OSFAM_URL || 'http://osfam3.ossys.org';
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
 * Ensure the Supabase Storage bucket exists (public access).
 * Safe to call on every sync — ignores "already exists" errors.
 */
async function ensureBucket() {
    const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: true,
        fileSizeLimit: 10485760, // 10 MB
    });
    if (error && !error.message.toLowerCase().includes('already exist')) {
        console.warn('[sync-stock] Bucket create warning:', error.message);
    }
}

/**
 * Log into OSFam and return asset map:
 * { ASSETCODE: { available: number, imgPath: string|null } }
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

    // 4. Parse rows — extract assetCode, available qty, and image path
    const assetMap = {};
    const rowRegex = /<tr\s+data-category[^>]*>([\s\S]*?)<\/tr>/g;
    let match;

    while ((match = rowRegex.exec(html)) !== null) {
        const rawRow = match[1];

        // All image srcs from this row (gallery support)
        const imgMatches = [...rawRow.matchAll(/src="(\.\/images\/[^"]+)"/g)];
        const imgPaths = imgMatches.map(m => m[1].replace(/^\.\//, ''));
        const imgPath = imgPaths[0] || null;

        // Text cells
        const cells = [...rawRow.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
            m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
        );

        if (cells.length >= 9) {
            const assetCode = (cells[2] || '').toUpperCase().trim();
            const available = parseInt(cells[8], 10);
            if (assetCode && !isNaN(available)) {
                assetMap[assetCode] = { available, imgPath, imgPaths };
            }
        }
    }

    if (Object.keys(assetMap).length === 0) {
        throw new Error('No assets parsed — login may have failed or page structure changed');
    }

    return assetMap;
}

/**
 * Download an OSFam image and upload it to Supabase Storage.
 * Returns the Supabase Storage public URL, or null on failure.
 * Skips the upload if the file already exists in Storage.
 *
 * @param {string|null} imgPath   - OSFam relative path, e.g. "images/FGCTBL3.jpg"
 * @param {string}      assetCode - e.g. "FGCTBL3"
 * @param {string|null} currentImage - current value of product.image in Supabase
 */
async function uploadImageToSupabase(imgPath, assetCode, currentImage) {
    try {
        if (!imgPath) return null;

        // Derive file extension from imgPath
        const extMatch = imgPath.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
        const filename = `${assetCode}${ext}`;
        const storagePath = `osfam/${filename}`;

        // Build the expected public URL for this file
        const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(storagePath);
        const publicUrl = urlData?.publicUrl;

        // If the product already points to this Supabase Storage URL → nothing to do
        if (currentImage && publicUrl && currentImage === publicUrl) {
            return publicUrl;
        }

        // Download the image from OSFam
        const res = await fetch(`${OSFAM_URL}/${imgPath}`);
        if (!res.ok) return null;
        const buffer = await res.arrayBuffer();

        // Determine content type
        const contentType = ext === '.png' ? 'image/png'
            : ext === '.gif' ? 'image/gif'
            : 'image/jpeg';

        // Upload to Supabase Storage (upsert: false → skip if already exists)
        const { error: uploadErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, Buffer.from(buffer), {
                contentType,
                upsert: false,
            });

        if (uploadErr) {
            // "already exists" is fine — we still return the public URL
            if (!uploadErr.message.toLowerCase().includes('already exist')) {
                console.warn(`[sync-stock] Upload failed for ${assetCode}:`, uploadErr.message);
                return null;
            }
        }

        return publicUrl || null;
    } catch (err) {
        console.warn(`[sync-stock] Image error for ${assetCode}:`, err.message);
        return null;
    }
}

export async function POST() {
    try {
        // Ensure the storage bucket exists before uploading
        await ensureBucket();

        // Fetch OSFam asset map
        const assetMap = await fetchOsfamAssets();

        // Get all Pico products
        const { data: products, error: fetchErr } = await supabase
            .from('products')
            .select('id, name, stock, image, gallery');
        if (fetchErr) throw fetchErr;

        // Match products and plan updates
        const toUpdate = [];
        const skipped = [];

        for (const product of products) {
            const code = extractAssetCode(product.name);
            if (!code || !(code in assetMap)) {
                skipped.push({ id: product.id, name: product.name, reason: code ? 'not in OSFam' : 'no code in name' });
                continue;
            }

            const { available: newStock, imgPath, imgPaths = [] } = assetMap[code];

            // Upload primary image to Supabase Storage (skips if already there)
            let newImage = product.image;
            if (imgPath) {
                const uploaded = await uploadImageToSupabase(imgPath, code, product.image);
                if (uploaded) newImage = uploaded;
            }

            // Upload all gallery images and collect their public URLs
            const galleryUrls = [];
            for (let i = 0; i < imgPaths.length; i++) {
                const gPath = imgPaths[i];
                const extMatch = gPath.match(/\.[^.]+$/);
                const ext = extMatch ? extMatch[0].toLowerCase() : '.jpg';
                const galCode = i === 0 ? code : `${code}_${i}`;
                const uploaded = await uploadImageToSupabase(gPath, galCode, null);
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

        // Apply updates where something changed
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
            osfamAssets: Object.keys(assetMap).length,
            picoProducts: products.length,
            matched: toUpdate.length,
            changed: changed.length,
            updated: updatedCount,
            stockUpdates,
            imageUpdates,
            galleryUpdates,
            errors,
            details: toUpdate,
        });

    } catch (err) {
        console.error('[sync-stock] Error:', err);
        return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
    }
}
