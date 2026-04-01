/**
 * Pico Stock — Data Store (Supabase)
 *
 * SQL to create tables (run once in Supabase SQL Editor):
 * See: supabase/schema.sql
 */

import { Pool } from 'pg';
import { supabase } from './supabase';

const DIRECT_DB_ENABLED = Boolean(process.env.DATABASE_URL);
const HAS_SERVICE_ROLE = Boolean(process.env.SUPABASE_SERVICE_KEY);

let pgPool = null;

function shouldPreferDirectDb() {
    return DIRECT_DB_ENABLED && !HAS_SERVICE_ROLE;
}

function getPgPool() {
    if (!DIRECT_DB_ENABLED) return null;
    if (!pgPool) {
        pgPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined,
        });
    }
    return pgPool;
}

async function directQuery(text, params = []) {
    const pool = getPgPool();
    if (!pool) {
        throw new Error('DATABASE_URL is not configured for direct database fallback');
    }
    return pool.query(text, params);
}

function shouldFallbackToDirectDb(error) {
    return DIRECT_DB_ENABLED && Boolean(error);
}

// ─── Row mappers (DB snake_case → App camelCase) ───────────────────────────

function mapProduct(row) {
    if (!row) return null;
    return {
        id:          row.id,
        name:        row.name,
        description: row.description || '',
        category:    row.category,
        price:       Number(row.price) || 0,
        currency:    row.currency || 'BHD',
        image:       row.image || '/products/table.svg',
        stock:       row.stock ?? null,
        inStock:     row.in_stock,
        featured:    row.featured || false,
    };
}

function mapOrder(row) {
    if (!row) return null;
    const exhibitor = row.exhibitor || {};
    const quotationMeta = exhibitor.quotation_meta || {};
    return {
        id:           row.id,
        items:        row.items || [],
        exhibitor:    exhibitor,
        total:        Number(row.total) || 0,
        days:         Number(row.days) || 1,
        grandTotal:   Number(row.grand_total) || Number(row.total) || 0,
        attachments:  row.attachments || [],
        status:       row.status || 'pending',
        notes:        row.notes || '',
        quotationId:  quotationMeta.quotation_id || null,
        quotationQtNumber: quotationMeta.quotation_qt_number || null,
        quotationStatus: quotationMeta.quotation_status || null,
        quotationSentAt: quotationMeta.quotation_sent_at || null,
        quotationConfirmedAt: quotationMeta.quotation_confirmed_at || null,
        createdAt:    row.created_at,
        updatedAt:    row.updated_at,
    };
}

function mapDesigner(row) {
    if (!row) return null;
    return {
        id:        row.id,
        name:      row.name,
        projects:  row.projects || [],
        createdAt: row.created_at,
    };
}

// ─── Products ──────────────────────────────────────────────────────────────

export async function getProducts() {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery('SELECT * FROM products ORDER BY created_at ASC');
        return rows.map(mapProduct);
    }

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery('SELECT * FROM products ORDER BY created_at ASC');
            return rows.map(mapProduct);
        }
        throw error;
    }
    return (data || []).map(mapProduct);
}

export async function getProductsByCategory(category) {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery(
            'SELECT * FROM products WHERE category = $1 ORDER BY created_at ASC',
            [category],
        );
        return rows.map(mapProduct);
    }

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .order('created_at', { ascending: true });
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery(
                'SELECT * FROM products WHERE category = $1 ORDER BY created_at ASC',
                [category],
            );
            return rows.map(mapProduct);
        }
        throw error;
    }
    return (data || []).map(mapProduct);
}

export async function getProductById(id) {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
        return mapProduct(rows[0] || null);
    }

    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
            return mapProduct(rows[0] || null);
        }
        return null;
    }
    return mapProduct(data);
}

export async function addProduct(product) {
    if (shouldPreferDirectDb()) {
        const row = toProductRow(product);
        const { rows } = await directQuery(
            `INSERT INTO products (id, name, description, category, price, currency, image, stock, in_stock, featured)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING *`,
            [
                row.id,
                row.name,
                row.description,
                row.category,
                row.price,
                row.currency,
                row.image,
                row.stock,
                row.in_stock,
                row.featured,
            ],
        );
        return mapProduct(rows[0]);
    }

    const { data, error } = await supabase
        .from('products')
        .insert([toProductRow(product)])
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return addProduct(product);
        }
        throw error;
    }
    return mapProduct(data);
}

export async function addProducts(newProducts) {
    if (shouldPreferDirectDb()) {
        const inserted = [];
        for (const product of newProducts) {
            inserted.push(await addProduct(product));
        }
        return inserted;
    }

    const { data, error } = await supabase
        .from('products')
        .insert(newProducts.map(toProductRow))
        .select();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const inserted = [];
            for (const product of newProducts) {
                inserted.push(await addProduct(product));
            }
            return inserted;
        }
        throw error;
    }
    return (data || []).map(mapProduct);
}

export async function updateProduct(id, updates) {
    const rowUpdates = {};
    if (updates.name        !== undefined) rowUpdates.name        = updates.name;
    if (updates.description !== undefined) rowUpdates.description = updates.description;
    if (updates.category    !== undefined) rowUpdates.category    = updates.category;
    if (updates.price       !== undefined) rowUpdates.price       = Number(updates.price);
    if (updates.currency    !== undefined) rowUpdates.currency    = updates.currency;
    if (updates.image       !== undefined) rowUpdates.image       = updates.image;
    if (updates.featured    !== undefined) rowUpdates.featured    = updates.featured;
    if (updates.stock       !== undefined) {
        rowUpdates.stock    = updates.stock === null ? null : Number(updates.stock);
        rowUpdates.in_stock = updates.inStock !== undefined ? updates.inStock : updates.stock > 0;
    }
    if (updates.inStock !== undefined && updates.stock === undefined) {
        rowUpdates.in_stock = updates.inStock;
    }

    if (shouldPreferDirectDb()) {
        const keys = Object.keys(rowUpdates);
        if (keys.length === 0) return getProductById(id);
        const values = keys.map((key) => rowUpdates[key]);
        const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
        const { rows } = await directQuery(
            `UPDATE products SET ${setClause} WHERE id = $1 RETURNING *`,
            [id, ...values],
        );
        return mapProduct(rows[0] || null);
    }

    const { data, error } = await supabase
        .from('products')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return updateProduct(id, updates);
        }
        return null;
    }
    return mapProduct(data);
}

export async function deleteProduct(id) {
    if (shouldPreferDirectDb()) {
        await directQuery('DELETE FROM products WHERE id = $1', [id]);
        return true;
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            await directQuery('DELETE FROM products WHERE id = $1', [id]);
            return true;
        }
        throw error;
    }
    return true;
}

export async function deleteProducts(ids) {
    if (shouldPreferDirectDb()) {
        await directQuery('DELETE FROM products WHERE id = ANY($1::text[])', [ids]);
        return true;
    }

    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            await directQuery('DELETE FROM products WHERE id = ANY($1::text[])', [ids]);
            return true;
        }
        throw error;
    }
    return true;
}

// Helper: JS product → DB row
function toProductRow(p) {
    return {
        id:          p.id,
        name:        String(p.name).trim(),
        description: p.description || '',
        category:    p.category || 'furniture',
        price:       Number(p.price) || 0,
        currency:    p.currency || 'BHD',
        image:       p.image || '/products/table.svg',
        stock:       p.stock !== undefined && p.stock !== null ? Number(p.stock) : null,
        in_stock:    p.inStock !== false,
        featured:    p.featured || false,
    };
}

// ─── Orders ────────────────────────────────────────────────────────────────

export async function getOrders() {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery('SELECT * FROM orders ORDER BY created_at DESC');
        return rows.map(mapOrder);
    }

    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery('SELECT * FROM orders ORDER BY created_at DESC');
            return rows.map(mapOrder);
        }
        throw error;
    }
    return (data || []).map(mapOrder);
}

export async function getOrderById(id) {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery('SELECT * FROM orders WHERE id = $1 LIMIT 1', [id]);
        return mapOrder(rows[0] || null);
    }

    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery('SELECT * FROM orders WHERE id = $1 LIMIT 1', [id]);
            return mapOrder(rows[0] || null);
        }
        return null;
    }
    return mapOrder(data);
}

export async function addOrder(order) {
    const quotationMeta = {
        quotation_id: order.quotationId || null,
        quotation_qt_number: order.quotationQtNumber || null,
        quotation_status: order.quotationStatus || null,
        quotation_sent_at: order.quotationSentAt || null,
        quotation_confirmed_at: order.quotationConfirmedAt || null,
    };

    if (shouldPreferDirectDb()) {
        const payload = {
            id: order.id,
            items: order.items || [],
            exhibitor: { ...(order.exhibitor || {}), quotation_meta: quotationMeta },
            total: Number(order.total) || 0,
            days: Number(order.days) || 1,
            grand_total: Number(order.grandTotal) || Number(order.total) || 0,
            attachments: order.attachments || [],
            status: order.status || 'pending',
            notes: order.notes || '',
            created_at: order.createdAt || new Date().toISOString(),
            updated_at: order.updatedAt || new Date().toISOString(),
        };
        const { rows } = await directQuery(
            `INSERT INTO orders (
                id, items, exhibitor, total, days, grand_total, attachments, status, notes, created_at, updated_at
            ) VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
            RETURNING *`,
            [
                payload.id,
                JSON.stringify(payload.items),
                JSON.stringify(payload.exhibitor),
                payload.total,
                payload.days,
                payload.grand_total,
                JSON.stringify(payload.attachments),
                payload.status,
                payload.notes,
                payload.created_at,
                payload.updated_at,
            ],
        );
        return mapOrder(rows[0]);
    }

    const { data, error } = await supabase
        .from('orders')
        .insert([{
            id:          order.id,
            items:       order.items || [],
            exhibitor:   { ...(order.exhibitor || {}), quotation_meta: quotationMeta },
            total:       Number(order.total) || 0,
            days:        Number(order.days) || 1,
            grand_total: Number(order.grandTotal) || Number(order.total) || 0,
            attachments: order.attachments || [],
            status:      order.status || 'pending',
            notes:       order.notes || '',
            created_at:  order.createdAt || new Date().toISOString(),
            updated_at:  order.updatedAt || new Date().toISOString(),
        }])
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return addOrder(order);
        }
        throw error;
    }
    return mapOrder(data);
}

export async function updateOrder(id, updates) {
    const rowUpdates = {};
    if (updates.status       !== undefined) rowUpdates.status        = updates.status;
    if (updates.notes        !== undefined) rowUpdates.notes         = updates.notes;
    if (updates.attachments  !== undefined) rowUpdates.attachments   = updates.attachments;
    if (updates.items        !== undefined) rowUpdates.items         = updates.items;
    if (updates.exhibitor    !== undefined) rowUpdates.exhibitor     = updates.exhibitor;
    if (updates.total        !== undefined) rowUpdates.total         = Number(updates.total);
    if (updates.days         !== undefined) rowUpdates.days          = Number(updates.days);
    if (updates.grandTotal   !== undefined) rowUpdates.grand_total   = Number(updates.grandTotal);
    rowUpdates.updated_at = updates.updatedAt || new Date().toISOString();

    const quoteMetaUpdateRequested = [
        'quotationId',
        'quotationQtNumber',
        'quotationStatus',
        'quotationSentAt',
        'quotationConfirmedAt',
    ].some((key) => updates[key] !== undefined);

    if (quoteMetaUpdateRequested) {
        const current = await getOrderById(id);
        if (!current) return null;
        const nextExhibitor = {
            ...(rowUpdates.exhibitor ?? current.exhibitor ?? {}),
            quotation_meta: {
                ...((rowUpdates.exhibitor ?? current.exhibitor ?? {}).quotation_meta || {}),
                quotation_id: updates.quotationId !== undefined ? updates.quotationId : current.quotationId,
                quotation_qt_number: updates.quotationQtNumber !== undefined ? updates.quotationQtNumber : current.quotationQtNumber,
                quotation_status: updates.quotationStatus !== undefined ? updates.quotationStatus : current.quotationStatus,
                quotation_sent_at: updates.quotationSentAt !== undefined ? updates.quotationSentAt : current.quotationSentAt,
                quotation_confirmed_at: updates.quotationConfirmedAt !== undefined ? updates.quotationConfirmedAt : current.quotationConfirmedAt,
            },
        };
        rowUpdates.exhibitor = nextExhibitor;
    }

    if (shouldPreferDirectDb()) {
        const keys = Object.keys(rowUpdates);
        if (keys.length === 0) return getOrderById(id);
        const values = keys.map((key) => {
            const value = rowUpdates[key];
            if (key === 'items' || key === 'exhibitor' || key === 'attachments') {
                return JSON.stringify(value);
            }
            return value;
        });
        const setClause = keys.map((key, index) => {
            const placeholder = `$${index + 2}`;
            return (key === 'items' || key === 'exhibitor' || key === 'attachments')
                ? `${key} = ${placeholder}::jsonb`
                : `${key} = ${placeholder}`;
        }).join(', ');
        const { rows } = await directQuery(
            `UPDATE orders SET ${setClause} WHERE id = $1 RETURNING *`,
            [id, ...values],
        );
        return mapOrder(rows[0] || null);
    }

    const { data, error } = await supabase
        .from('orders')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return updateOrder(id, updates);
        }
        return null;
    }
    return mapOrder(data);
}

export async function deleteOrder(id) {
    if (shouldPreferDirectDb()) {
        await directQuery('DELETE FROM orders WHERE id = $1', [id]);
        return true;
    }

    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            await directQuery('DELETE FROM orders WHERE id = $1', [id]);
            return true;
        }
        throw error;
    }
    return true;
}

// ─── Designers ─────────────────────────────────────────────────────────────

export async function getDesigners() {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery('SELECT * FROM designers ORDER BY created_at ASC');
        return rows.map(mapDesigner);
    }

    const { data, error } = await supabase
        .from('designers')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            const { rows } = await directQuery('SELECT * FROM designers ORDER BY created_at ASC');
            return rows.map(mapDesigner);
        }
        throw error;
    }
    return (data || []).map(mapDesigner);
}

export async function addDesigner(designer) {
    if (shouldPreferDirectDb()) {
        const { rows } = await directQuery(
            `INSERT INTO designers (id, name, projects, created_at)
             VALUES ($1,$2,$3::jsonb,$4)
             RETURNING *`,
            [
                designer.id,
                designer.name,
                JSON.stringify(designer.projects || []),
                designer.createdAt || new Date().toISOString(),
            ],
        );
        return mapDesigner(rows[0]);
    }

    const { data, error } = await supabase
        .from('designers')
        .insert([{
            id:         designer.id,
            name:       designer.name,
            projects:   designer.projects || [],
            created_at: designer.createdAt || new Date().toISOString(),
        }])
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return addDesigner(designer);
        }
        throw error;
    }
    return mapDesigner(data);
}

export async function updateDesigner(id, updates) {
    const rowUpdates = {};
    if (updates.name     !== undefined) rowUpdates.name     = updates.name;
    if (updates.projects !== undefined) rowUpdates.projects = updates.projects;

    if (shouldPreferDirectDb()) {
        const keys = Object.keys(rowUpdates);
        if (keys.length === 0) return null;
        const values = keys.map((key) => key === 'projects' ? JSON.stringify(rowUpdates[key]) : rowUpdates[key]);
        const setClause = keys.map((key, index) => (
            key === 'projects' ? `${key} = $${index + 2}::jsonb` : `${key} = $${index + 2}`
        )).join(', ');
        const { rows } = await directQuery(
            `UPDATE designers SET ${setClause} WHERE id = $1 RETURNING *`,
            [id, ...values],
        );
        return mapDesigner(rows[0] || null);
    }

    const { data, error } = await supabase
        .from('designers')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            return updateDesigner(id, updates);
        }
        return null;
    }
    return mapDesigner(data);
}

export async function deleteDesigner(id) {
    if (shouldPreferDirectDb()) {
        await directQuery('DELETE FROM designers WHERE id = $1', [id]);
        return true;
    }

    const { error } = await supabase.from('designers').delete().eq('id', id);
    if (error) {
        if (shouldFallbackToDirectDb(error)) {
            await directQuery('DELETE FROM designers WHERE id = $1', [id]);
            return true;
        }
        throw error;
    }
    return true;
}
