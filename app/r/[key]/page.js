import { notFound } from 'next/navigation';
import OrganizerReview from '@/components/events/OrganizerReview';
import { findEventByReviewKey } from '@/lib/eventReviewKey';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Organizer review — Pico',
    robots: { index: false, follow: false },
};

/** Short organizer link: /r/<key>. */
export default async function ShortReviewPage({ params }) {
    const config = await findEventByReviewKey(params.key);
    if (!config) notFound();
    return <OrganizerReview slug={config.id} reviewKey={params.key} />;
}
