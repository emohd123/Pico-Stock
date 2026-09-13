import Link from 'next/link';
import { LANDMARK_SCAN_CATALOG } from '@/lib/picoAi/landmarkScanCatalog';
import styles from './landmarks.module.css';

export const metadata = { title: 'Bahrain & Saudi Arabia Landmark Stories | Pico' };

export default function LandmarksPage() {
  return <main className={styles.page}><div className={styles.wrap}><span className={styles.eyebrow}>PICO / NATIONAL DAY JOURNEY</span><h1>Landmark stories</h1><p>Select a landmark to preview its mobile destination page.</p><div className={styles.grid}>{LANDMARK_SCAN_CATALOG.map(item=><Link key={item.id} href={`/landmarks/${item.id}`}><small>{item.reference} · {item.country}</small><strong>{item.name}</strong><span>Open story ↗</span></Link>)}</div></div></main>;
}
