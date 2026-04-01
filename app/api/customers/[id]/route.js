import { getCustomerById, updateCustomer, deleteCustomer } from '@/lib/customerStore';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    try {
        const customer = await getCustomerById(params.id);
        if (!customer) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(customer);
    } catch (error) {
        return Response.json({ error: error.message || 'Failed to load customer' }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    try {
        const payload = await request.json();
        const customer = await updateCustomer(params.id, payload);
        if (!customer) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(customer);
    } catch (error) {
        return Response.json({ error: error.message || 'Failed to update customer' }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    try {
        const deleted = await deleteCustomer(params.id);
        if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ success: true });
    } catch (error) {
        return Response.json({ error: error.message || 'Failed to delete customer' }, { status: 500 });
    }
}
