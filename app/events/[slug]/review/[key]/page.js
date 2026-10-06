import OrganizerReview from '@/components/events/OrganizerReview';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Organizer review — Pico',
    robots: { index: false, follow: false },
};

export default function OrganizerReviewPage({ params }) {
    return <OrganizerReview slug={params.slug} reviewKey={params.key} />;
}
