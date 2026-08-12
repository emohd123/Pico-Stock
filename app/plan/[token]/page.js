import { notFound } from 'next/navigation';
import { planShareTokenValid } from '@/lib/ministry/queries';
import SeasonPlanView from '@/components/ministry/SeasonPlanView';

export const dynamic = 'force-dynamic';

// Unauthenticated link, so keep it out of search results.
export const metadata = { robots: { index: false, follow: false }, title: 'Season plan' };

// Read-only season plan for management. Same component, same data, computed at
// the moment the page is opened — so the link never goes stale — but with no
// control that can write anything and no route back into the admin portal.
export default async function SharedPlanPage({ params }) {
    if (!(await planShareTokenValid(params.token))) notFound();
    return <SeasonPlanView readOnly generatedAt={Date.now()} />;
}
