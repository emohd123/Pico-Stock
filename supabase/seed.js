/**
 * Pico Stock — Supabase Seed Script
 * Migrates existing JSON data to Supabase.
 *
 * Usage:
 *   node supabase/seed.js
 *
 * Run AFTER creating the tables via supabase/schema.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env from .env.local manually (Node doesn't load it automatically)
function loadEnv() {
    const envPath = path.join(__dirname, '../.env.local');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

function readJSON(name) {
    const p = path.join(__dirname, '../data', name);
    if (!fs.existsSync(p)) return [];
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return []; }
}

async function seedProducts() {
    const products = readJSON('products.json');
    if (!products.length) { console.log('  No products to seed.'); return; }

    const rows = products.map(p => ({
        id:          p.id,
        name:        p.name || '',
        description: p.description || '',
        category:    p.category || 'furniture',
        price:       Number(p.price) || 0,
        currency:    p.currency || 'BHD',
        image:       p.image || '/products/table.svg',
        stock:       p.stock !== undefined && p.stock !== null ? Number(p.stock) : null,
        in_stock:    p.inStock !== false,
        featured:    p.featured || false,
    }));

    // Upsert so re-running is safe
    const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
    if (error) {
        console.error('  ❌ Products error:', error.message);
    } else {
        console.log(`  ✅ Seeded ${rows.length} products`);
    }
}

async function seedOrders() {
    const orders = readJSON('orders.json');
    if (!orders.length) { console.log('  No orders to seed.'); return; }

    const rows = orders.map(o => ({
        id:          o.id,
        items:       o.items || [],
        exhibitor:   o.exhibitor || {},
        total:       Number(o.total) || 0,
        attachments: o.attachments || [],
        status:      o.status || 'pending',
        notes:       o.notes || '',
        created_at:  o.createdAt || new Date().toISOString(),
        updated_at:  o.updatedAt || new Date().toISOString(),
    }));

    const { error } = await supabase.from('orders').upsert(rows, { onConflict: 'id' });
    if (error) {
        console.error('  ❌ Orders error:', error.message);
    } else {
        console.log(`  ✅ Seeded ${rows.length} orders`);
    }
}

async function seedDesigners() {
    const designers = readJSON('designers.json');
    if (!designers.length) { console.log('  No designers to seed.'); return; }

    const rows = designers.map(d => ({
        id:         d.id,
        name:       d.name,
        projects:   d.projects || [],
        created_at: d.createdAt || new Date().toISOString(),
    }));

    const { error } = await supabase.from('designers').upsert(rows, { onConflict: 'id' });
    if (error) {
        console.error('  ❌ Designers error:', error.message);
    } else {
        console.log(`  ✅ Seeded ${rows.length} designers`);
    }
}

async function main() {
    console.log('🚀 Pico Stock — Seeding Supabase...\n');
    console.log('📦 Products:');
    await seedProducts();
    console.log('📋 Orders:');
    await seedOrders();
    console.log('🎨 Designers:');
    await seedDesigners();
    console.log('\n✅ Done! Your Supabase database is ready.');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
