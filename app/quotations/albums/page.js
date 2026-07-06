import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAdmin } from '@/lib/ministry/auth';
import { getAllMinistries, getMinistryPhotos } from '@/lib/ministry/queries';
import PhotoAlbums from '@/components/ministry/PhotoAlbums';

export const dynamic = 'force-dynamic';

export default async function AlbumsPage() {
    if (!isAdmin()) notFound();
    const ministries = await getAllMinistries();
    const albums = await Promise.all(ministries.map(async (m) => {
        const photos = await getMinistryPhotos(m.id);
        return {
            id: m.id, name: m.name, nameAr: m.nameAr || '',
            photos: photos.map((p) => ({ id: p.id, caption: p.caption || '' })),
        };
    }));
    // Albums with photos first, then the empty ones.
    albums.sort((a, b) => (b.photos.length > 0) - (a.photos.length > 0));
    const totalPhotos = albums.reduce((n, a) => n + a.photos.length, 0);

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#4D4D4F' }}>
            <header style={{ borderBottom: '4px solid #00C7B1', background: '#fff' }}>
                <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px' }}>
                    <img src="/brand/pico-logo.png" alt="PICO" style={{ height: 40 }} />
                    <img src="/brand/bahrain-emblem.png" alt="Kingdom of Bahrain" style={{ height: 44 }} />
                </div>
                <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 20px 12px' }}>
                    <Link href="/quotations" style={{ fontSize: 12, color: '#00857A' }}>← Admin dashboard</Link>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 0' }}>Photo albums</h1>
                    <p style={{ fontSize: 13, color: '#75787B', margin: '2px 0 0' }}>{albums.length} ministries · {totalPhotos} photos — click an album to view, click again to hide.</p>
                </div>
            </header>
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 20px' }}>
                <PhotoAlbums albums={albums} />
            </main>
        </div>
    );
}
