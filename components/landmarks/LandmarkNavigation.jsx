'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import styles from './HeritagePostcard.module.css';

export default function LandmarkNavigation({ story, landmarks, language }) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('all');
  const arabic = language === 'ar';
  const index = landmarks.findIndex(item => item.id === story.id);
  const previous = landmarks[(index - 1 + landmarks.length) % landmarks.length];
  const next = landmarks[(index + 1) % landmarks.length];
  const visible = landmarks.filter(item => (country === 'all' || item.country === country) &&
    `${item.reference} ${item.title.en} ${item.title.ar}`.toLowerCase().includes(query.toLowerCase().trim()));
  if (!previous || !next) return null;
  return <>
    <nav className={styles.journeyNav} aria-label={arabic ? 'اكتشف المعالم' : 'Explore landmarks'} dir={arabic ? 'rtl' : 'ltr'}>
      <div className={styles.journeyRule} aria-hidden="true"><span>✧</span></div>
      <div className={styles.journeyControls}>
        <Link href={`/landmarks/${previous.id}`} aria-label={`${arabic ? 'السابق' : 'Previous'}: ${previous.title[language]}`} className={styles.journeyArrow}>←</Link>
        <button ref={opener} type="button" className={styles.atlasOpen} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
          <small>{story.reference} <span aria-hidden="true">·</span> {arabic ? `${landmarks.length} معلماً` : `${String(index + 1).padStart(2, '0')} OF ${landmarks.length}`}</small>
          <span>{arabic ? 'اكتشف جميع المعالم' : 'Explore all landmarks'} <i aria-hidden="true">↗</i></span>
        </button>
        <Link href={`/landmarks/${next.id}`} aria-label={`${arabic ? 'التالي' : 'Next'}: ${next.title[language]}`} className={styles.journeyArrow}>→</Link>
      </div>
      <dialog ref={dialog} className={`${styles.reader} ${styles.atlas}`} dir={arabic ? 'rtl' : 'ltr'} aria-label={arabic ? 'جميع المعالم' : 'All landmarks'} onClose={() => opener.current?.focus()}>
        <header className={styles.readerHeader}><div><small>{arabic ? 'تراث يجمعنا' : 'OUR SHARED HERITAGE'}</small><h2>{arabic ? 'خمسون حكاية' : 'Fifty stories to discover'}</h2></div><div className={styles.readerControls}><button type="button" className={styles.close} onClick={() => dialog.current.close()} aria-label={arabic ? 'إغلاق المعالم' : 'Close landmarks'}>×</button></div></header>
        <div className={styles.atlasFilters}>
          <label><span className={styles.screenReaderText}>{arabic ? 'ابحث عن معلم' : 'Search landmarks'}</span><input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={arabic ? 'ابحث عن اسم أو رمز المعلم' : 'Search a name or reference'} /></label>
          <label><span className={styles.screenReaderText}>{arabic ? 'الدولة' : 'Country'}</span><select value={country} onChange={event => setCountry(event.target.value)}><option value="all">{arabic ? 'الجميع' : 'Both countries'}</option><option value="Saudi Arabia">{arabic ? 'السعودية' : 'Saudi Arabia'}</option><option value="Bahrain">{arabic ? 'البحرين' : 'Bahrain'}</option></select></label>
        </div>
        <div className={styles.atlasList}>
          {visible.map(item => <Link key={item.id} href={`/landmarks/${item.id}`} prefetch={false} onClick={() => dialog.current?.close()} aria-current={item.id === story.id ? 'page' : undefined}><small>{item.reference}</small><div><strong>{item.title[language]}</strong><span>{item.location[language]}</span></div><span aria-hidden="true">↗</span></Link>)}
          {!visible.length && <p className={styles.noResults}>{arabic ? 'لا توجد نتائج مطابقة' : 'No landmarks match your search.'}</p>}
        </div>
      </dialog>
    </nav>
  </>;
}
