import Link from 'next/link';
import { LANDMARK_JOURNEY_INDEX } from '@/lib/landmarkStories';
import styles from './landmarks.module.css';

export const metadata = { title: 'Bahrain & Saudi Arabia Landmark Stories | Pico' };

export default function LandmarksPage() {
  return <main className={styles.page}><div className={styles.wrap}><span className={styles.eyebrow}>GREETINGS FROM BAHRAIN</span><h1>Fifty places.<br/>Countless stories.</h1><p>A journey through the heritage, landscapes and imagination of Bahrain and Saudi Arabia.</p><nav className={styles.countryLinks}><a href="#saudi">Saudi Arabia · 40</a><a href="#bahrain">Bahrain · 10</a></nav>{['Saudi Arabia','Bahrain'].map(country=><section key={country} id={country==='Bahrain'?'bahrain':'saudi'} className={styles.collection} data-country={country}><header><h2>{country}</h2><span>{country==='Bahrain'?'مملكة البحرين':'المملكة العربية السعودية'}</span></header><div className={styles.posterGrid}>{LANDMARK_JOURNEY_INDEX.filter(item=>item.country===country).map(item=><Link key={item.id} href={`/landmarks/${item.id}`} prefetch={false}><img src={item.postcard} alt={`${item.title.en} heritage postcard`} loading="lazy" width="941" height="1672"/><div><small>{item.reference} · {item.location.en}</small><strong>{item.title.en}</strong><span lang="ar" dir="rtl">{item.title.ar}</span></div></Link>)}</div></section>)}</div></main>;
}
