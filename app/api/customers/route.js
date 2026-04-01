import { getCustomers, createCustomer } from '@/lib/customerStore';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const customers = await getCustomers();
        return Response.json(customers);
    } catch (error) {
        return Response.json({ error: error.message || 'Failed to load customers' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const payload = await request.json();
        if (!payload.display_name?.trim()) {
            return Response.json({ error: 'display_name is required' }, { status: 400 });
        }
        const customer = await createCustomer(payload);
        return Response.json(customer, { status: 201 });
    } catch (error) {
        return Response.json({ error: error.message || 'Failed to create customer' }, { status: 500 });
    }
}
