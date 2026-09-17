import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findLandmarkScanItem, LANDMARK_SCAN_CATALOG } from '@/lib/picoAi/landmarkScanCatalog';
import styles from '../landmarks.module.css';
import LandmarkJourney from '@/components/landmarks/LandmarkJourney';
import { LANDMARK_STORIES, LANDMARK_JOURNEY_INDEX } from '@/lib/landmarkStories';

export function generateViewport({params}) {
  return { width:'device-width', initialScale:1, maximumScale:5, viewportFit:'cover', themeColor:findLandmarkScanItem(params.id)?.country === 'Bahrain' ? '#681b28' : '#002d27' };
}

export function generateStaticParams(){return LANDMARK_SCAN_CATALOG.map(({id})=>({id}));}
export function generateMetadata({params}) {
  const item=findLandmarkScanItem(params.id);
  const story=LANDMARK_STORIES[params.id];
  return {
    title:item?`${item.name} | National Day Landmark`:'Landmark story',
    ...(story ? {
      metadataBase:new URL('https://pico-stock.vercel.app'),
      description:story.lead.en,
      keywords:[story.title.en,item.country,'Bahrain International Airport','National Day'],
      openGraph:{title:`${story.title.en} | Greetings from Bahrain`,description:story.lead.en,images:[story.hero.src]},
    } : {}),
  };
}

export default function LandmarkPage({params}) {
  const item=findLandmarkScanItem(params.id);if(!item)notFound();
  const story=LANDMARK_STORIES[item.id];
  if(story)return <LandmarkJourney key={story.id} story={story} landmarks={LANDMARK_JOURNEY_INDEX} />;
  return <main className={styles.story}><div className={styles.flagRail}><i></i><i></i><span>BAHRAIN × SAUDI ARABIA</span></div><article><header><Link href="/landmarks">← All landmarks</Link><span>{item.reference} / NATIONAL DAY</span></header><div className={styles.mark} aria-hidden="true"><span>{item.reference}</span><i>✦</i></div><p className={styles.country}>{item.country}</p><h1>{item.name}</h1><p className={styles.intro}>Welcome to the Bahrain International Airport National Day journey. This trackable page is ready for the approved landmark story, real photographs and guest experience.</p><div className={styles.status}><strong>QR connected</strong><span>Your visit has been added anonymously to the live landmark report.</span></div><footer>Greetings from Bahrain · Happy Saudi National Day</footer></article></main>;
}
