import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://wldurkxlzkqmcfadpybd.supabase.co';
const SERVICE_KEY = 'sb_secret_Tjqhr6yYkLNzQW2ErR7ejg_N09DAAEX';
const STORAGE_BUCKET = 'product-images';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

// Fetch all products
const { data: products, error: fetchErr } = await supabase
    .from('products')
    .select('id, name, description, price, stock, in_stock, image')
    .order('name');

if (fetchErr) { console.error('Fetch error:', fetchErr); process.exit(1); }
console.log('Loaded', products.length, 'products\n');

let descFixed = 0, nameFixed = 0, imgFixed = 0, stockFixed = 0, errors = 0;

for (const p of products) {
    const updates = {};

    // --- Fix 1: Clear garbage descriptions ---
    if (p.description !== null && p.description !== undefined && p.description !== '') {
        updates.description = null;
        descFixed++;
    }

    // --- Fix 2: Decode HTML entities in name ---
    if (p.name && p.name.includes('&amp;')) {
        updates.name = p.name
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        nameFixed++;
        console.log('Name fix: ' + p.name.substring(0, 50));
        console.log('       → ' + updates.name.substring(0, 50));
    }

    // --- Fix 3: Set in_stock=false for null-stock products ---
    if (p.stock === null && p.in_stock === true) {
        updates.in_stock = false;
        stockFixed++;
    }

    // --- Fix 4: Upload local /products/extracted/ images to Supabase Storage ---
    if (p.image && p.image.startsWith('/products/extracted/') && !p.image.includes('supabase')) {
        const filename = path.basename(p.image);
        const localPath = path.join(__dirname, 'public', 'products', 'extracted', filename);

        if (fs.existsSync(localPath)) {
            const ext = path.extname(filename).toLowerCase();
            const contentType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
            const storagePath = `extracted/${filename}`;
            const fileBuffer = fs.readFileSync(localPath);

            const { error: upErr } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(storagePath, fileBuffer, { contentType, upsert: false });

            if (!upErr || (upErr.message && upErr.message.toLowerCase().includes('already exist'))) {
                const { data: { publicUrl } } = supabase.storage
                    .from(STORAGE_BUCKET)
                    .getPublicUrl(storagePath);
                updates.image = publicUrl;
                imgFixed++;
                console.log('Image → Supabase: ' + p.name.substring(0, 40) + (upErr ? ' (was already there)' : ' (uploaded)'));
            } else {
                console.error('Upload failed for', p.name.substring(0, 40), ':', upErr.message);
                errors++;
            }
        } else {
            console.warn('Local file missing:', localPath);
        }
    }

    // Apply all updates for this product
    if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
            .from('products')
            .update(updates)
            .eq('id', p.id);

        if (updErr) {
            console.error('DB update failed:', p.id, updErr.message);
            errors++;
        }
    }
}

console.log('\n=== DONE ===');
console.log('Descriptions cleared:', descFixed);
console.log('Names HTML-decoded:  ', nameFixed);
console.log('in_stock fixed:      ', stockFixed);
console.log('Images → Supabase:  ', imgFixed);
console.log('Errors:              ', errors);
