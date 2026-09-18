import { createEventLayoutHandler } from '@/lib/eventLayoutApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const handler = createEventLayoutHandler();
export { handler as GET, handler as PUT, handler as POST };
