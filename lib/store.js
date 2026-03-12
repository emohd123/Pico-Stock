/**
 * Pico Stock — Data Store (Supabase)
 *
 * SQL to create tables (run once in Supabase SQL Editor):
 * See: supabase/schema.sql
 */

import { supabase } from './supabase';

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
    return {
        id:           row.id,
        items:        row.items || [],
        exhibitor:    row.exhibitor || {},
        total:        Number(row.total) || 0,
        days:         Number(row.days) || 1,
        grandTotal:   Number(row.grand_total) || Number(row.total) || 0,
        attachments:  row.attachments || [],
        status:       row.status || 'pending',
        notes:        row.notes || '',
        zohoQuoteId:  row.zoho_quote_id || null,
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
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProduct);
}

export async function getProductsByCategory(category) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', category)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapProduct);
}

export async function getProductById(id) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return mapProduct(data);
}

export async function addProduct(product) {
    const { data, error } = await supabase
        .from('products')
        .insert([toProductRow(product)])
        .select()
        .single();
    if (error) throw error;
    return mapProduct(data);
}

export async function addProducts(newProducts) {
    const { data, error } = await supabase
        .from('products')
        .insert(newProducts.map(toProductRow))
        .select();
    if (error) throw error;
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

    const { data, error } = await supabase
        .from('products')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) return null;
    return mapProduct(data);
}

export async function deleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    return true;
}

export async function deleteProducts(ids) {
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) throw error;
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
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapOrder);
}

export async function getOrderById(id) {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();
    if (error) return null;
    return mapOrder(data);
}

export async function addOrder(order) {
    const { data, error } = await supabase
        .from('orders')
        .insert([{
            id:          order.id,
            items:       order.items || [],
            exhibitor:   order.exhibitor || {},
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
    if (error) throw error;
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
    if (updates.zoho_quote_id !== undefined) rowUpdates.zoho_quote_id = updates.zoho_quote_id;
    rowUpdates.updated_at = updates.updatedAt || new Date().toISOString();

    const { data, error } = await supabase
        .from('orders')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) return null;
    return mapOrder(data);
}

export async function deleteOrder(id) {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
}

// ─── Designers ─────────────────────────────────────────────────────────────

export async function getDesigners() {
    const { data, error } = await supabase
        .from('designers')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapDesigner);
}

export async function addDesigner(designer) {
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
    if (error) throw error;
    return mapDesigner(data);
}

export async function updateDesigner(id, updates) {
    const rowUpdates = {};
    if (updates.name     !== undefined) rowUpdates.name     = updates.name;
    if (updates.projects !== undefined) rowUpdates.projects = updates.projects;

    const { data, error } = await supabase
        .from('designers')
        .update(rowUpdates)
        .eq('id', id)
        .select()
        .single();
    if (error) return null;
    return mapDesigner(data);
}

export async function deleteDesigner(id) {
    const { error } = await supabase.from('designers').delete().eq('id', id);
    if (error) throw error;
    return true;
}
