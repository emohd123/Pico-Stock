import { NextResponse } from 'next/server';
import { getProducts, getProductsByCategory, getOrders, getOrderStockInfo, addProducts, updateProduct, deleteProduct, deleteProducts } from '@/lib/store';

const STOCK_HOLD_STATUSES = new Set(['confirmed', 'processing']);

function applyReservedStock(products, orders) {
    const reservedByProductId = new Map();

    for (const order of orders) {
        if (!STOCK_HOLD_STATUSES.has(order.status)) continue;

        for (const item of order.items || []) {
            if (!item?.id) continue;
            const quantity = Number(item.quantity) || 0;
            if (quantity <= 0) continue;

            reservedByProductId.set(
                item.id,
                (reservedByProductId.get(item.id) || 0) + quantity
            );
        }
    }

    return products.map(product => {
        if (product.stock === null || product.stock === undefined) {
            return {
                ...product,
                reservedQty: 0,
                availableStock: null,
            };
        }

        const reservedQty = reservedByProductId.get(product.id) || 0;
        const availableStock = Math.max(0, Number(product.stock) - reservedQty);

        return {
            ...product,
            reservedQty,
            availableStock,
            inStock: availableStock > 0,
        };
    });
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    try {
        const [products, orders] = await Promise.all([
            category ? getProductsByCategory(category) : getProducts(),
            getOrderStockInfo().catch(() => []),
        ]);

        return NextResponse.json(applyReservedStock(products, orders));
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const existingProducts = await getProducts();
        const existingNames = new Set(
            existingProducts
                .filter(p => p && p.name)
                .map(p => String(p.name).toLowerCase().trim())
        );

        const CAT_PREFIX = { furniture: 'FRN', 'tv-led': 'TVL', graphics: 'GFX' };

        const productsToCreate = Array.isArray(body) ? body : [body];
        const newProducts = productsToCreate
            .filter(item => item && item.name)
            .map(item => {
                const rawStock = item.stock !== undefined && item.stock !== '' && item.stock !== null
                    ? parseInt(item.stock) : undefined;
                const stock = rawStock !== undefined && !isNaN(rawStock) ? rawStock : undefined;
                const inStock = stock !== undefined ? stock > 0 : (item.inStock !== false);
                const catPrefix = CAT_PREFIX[item.category] || 'PRD';
                const randomSuffix = Date.now().toString(36).toUpperCase().slice(-3)
                    + Math.random().toString(36).toUpperCase().slice(2, 5);
                return {
                    id: item.id && item.id.startsWith('PICO-')
                        ? item.id
                        : `PICO-${catPrefix}-${randomSuffix}`,
                    name: String(item.name).trim(),
                    description: item.description || '',
                    category: item.category || 'furniture',
                    price: parseFloat(item.price) || 0,
                    currency: 'BHD',
                    image: item.image || '/products/table.svg',
                    stock: stock !== undefined ? stock : null,
                    inStock,
                    featured: item.featured || false,
                };
            })
            .filter(p => !existingNames.has(p.name.toLowerCase()));

        let saved = [];
        if (newProducts.length > 0) {
            saved = await addProducts(newProducts);
        }

        return NextResponse.json({
            success: true,
            count: saved.length,
            ignored: productsToCreate.length - saved.length,
            products: Array.isArray(body) ? saved : (saved[0] || null)
        });
    } catch (error) {
        console.error('Create product error:', error);
        return NextResponse.json({ error: 'Failed to create product(s)' }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
        }

        if (updates.price !== undefined) updates.price = parseFloat(updates.price);
        if (updates.stock !== undefined) {
            const parsedStock = updates.stock === '' || updates.stock === null ? null : parseInt(updates.stock);
            updates.stock = parsedStock;
            if (parsedStock != null) updates.inStock = parsedStock > 0;
        }

        const updated = await updateProduct(id, updates);
        if (!updated) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, product: updated });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const ids = searchParams.get('ids');

        if (ids) {
            const idList = ids.split(',');
            await deleteProducts(idList);
            return NextResponse.json({ success: true });
        }

        if (id) {
            await deleteProduct(id);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Product ID(s) required' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete product(s)' }, { status: 500 });
    }
}
