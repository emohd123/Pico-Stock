import { notFound } from 'next/navigation';
import EventMarketplace from '@/components/events/EventMarketplace';
import { getEventMarketplace } from '@/lib/eventMarketplaceStore';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
    const config = await getEventMarketplace(params.slug).catch(() => null);
    if (!config) return { title: 'Event not found — Pico' };
    return {
        title: `${config.name} — Pico Exhibition Services`,
        description: config.tagline || config.description || 'Event rental catalogue by Pico International (Bahrain).',
    };
}

export default async function EventMarketplacePage({ params }) {
    const config = await getEventMarketplace(params.slug).catch(() => null);
    if (!config) notFound();
    return <EventMarketplace slug={config.id} />;
}
