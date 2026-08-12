import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getPlanShareToken } from '@/lib/ministry/queries';
import SeasonPlanView from '@/components/ministry/SeasonPlanView';

export const dynamic = 'force-dynamic';

// Admin view of the season plan: the same component the shared link renders,
// plus the venue pickers and the share control.
export default async function PlanPage() {
    if (!isAdmin()) notFound();

    const h = headers();
    const origin = `${h.get('x-forwarded-proto') || 'https'}://${h.get('host')}`;
    const token = await getPlanShareToken();

    return <SeasonPlanView shareUrl={`${origin}/plan/${token}`} generatedAt={Date.now()} />;
}
