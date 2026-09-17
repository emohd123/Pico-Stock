'use client';
import { useState } from 'react';
import { nameArtBackground } from '@/lib/nameArt/config';
import styles from './name-art.module.css';
export default function NamePoster({ name = '', background = 'pearls', image, motion = 'none', drift = false }) {
  const [readyImage,setReadyImage]=useState(null);
  const ready=readyImage===image;
  const item=nameArtBackground(background), arabic=/\p{Script=Arabic}/u.test(name);
  return <div className={styles.poster} data-motion={ready?motion:'none'} data-drift={drift}>
    <img className={styles.background} src={item.src} alt="National Day heritage background with Bahrain and Saudi Arabian landmarks" />
    {image ? <img key={image} className={styles.resultLayer} src={image} onLoad={()=>setReadyImage(image)} style={{opacity:ready?1:0}} alt={`Personalised name poster for ${name}`} /> : name && <svg className={styles.namePreview} viewBox="0 0 1024 1536" role="img" aria-label={name}>
      <defs><linearGradient id={`name-green-${background}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#264331"/><stop offset=".5" stopColor="#092b20"/><stop offset="1" stopColor="#163d2b"/></linearGradient><filter id={`name-shadow-${background}`} x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="2" dy="4" stdDeviation="2" floodColor="#443018" floodOpacity=".4"/></filter></defs>
      <text x="512" y={1536*item.centre} dy=".32em" textAnchor="middle" direction={arabic?'rtl':'ltr'} style={{fontFamily:arabic?'NameArtArabic':'NameArtSerif',fontSize:Math.min(140,1024*item.width/(Math.max(name.length,1)*.73)),fontWeight:600}} stroke="#bf9952" strokeWidth="1.7" paintOrder="stroke" fill={`url(#name-green-${background})`} filter={`url(#name-shadow-${background})`}>{arabic?name:name.toUpperCase()}</text>
    </svg>}
  </div>;
}
