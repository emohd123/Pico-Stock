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

export default async function EventMarketplacePage({ params, searchParams }) {
    const config = await getEventMarketplace(params.slug).catch(() => null);
    if (!config) notFound();
    const editKey = String(searchParams?.edit || '').slice(0, 40);
    const fromKey = String(searchParams?.from || '').slice(0, 40);
    return <EventMarketplace slug={config.id} editKey={editKey} fromKey={fromKey} />;
}
