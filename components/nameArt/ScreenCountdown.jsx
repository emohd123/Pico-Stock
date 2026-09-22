'use client';
import { useEffect, useState } from 'react';
import styles from './name-art.module.css';
import { NAME_ART_SELFIE, nameArtBandIsOn } from '@/lib/nameArt/config';

// How long "SMILE" stays up after zero, then the countdown leaves the name alone on the wall.
const SMILE_MS = 1200;
const RING = 553; // circumference of the r=88 dial

/* The big screen's half of the selfie countdown. `at` is the local moment it starts, worked out
   from the server's selfieIn, so this shows the same number as the booth tablet at the same
   time. It sits over the lower part of the poster and leaves the name clear - the name is what
   the guest is photographing. There is no flash here, unlike the tablet: a white wall at the
   moment the shutter fires would ruin every selfie taken against it. */
export default function ScreenCountdown({ at }) {
  const [now, setNow] = useState(() => Date.now());
  const total = NAME_ART_SELFIE.seconds * 1000;

  useEffect(() => {
    if (!at) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= at + total + SMILE_MS) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, [at, total]);

  if (!at) return null;
  const elapsed = now - at;
  if (elapsed < 0 || elapsed >= total + SMILE_MS) return null;

  const band = nameArtBandIsOn();
  const left = NAME_ART_SELFIE.seconds - Math.floor(elapsed / 1000);
  const drained = RING * Math.min(1, elapsed / total);

  return <div className={styles.selfieCue} data-band={band} data-hurry={left <= 2}>
    <p className={styles.selfieCall}>
      {band ? 'Selfie with the band!' : 'Selfie time!'}
      <span dir="rtl">{band ? 'سيلفي مع الفرقة!' : 'وقت السيلفي!'}</span>
    </p>
    <div className={styles.selfieDial}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className={styles.selfieTrack} cx="100" cy="100" r="88"/>
        <circle className={styles.selfieArc} cx="100" cy="100" r="88" style={{ strokeDashoffset: drained }}/>
      </svg>
      <b key={left > 0 ? left : 'smile'} data-smile={left <= 0}>{left > 0 ? left : 'SMILE!'}</b>
    </div>
  </div>;
}
