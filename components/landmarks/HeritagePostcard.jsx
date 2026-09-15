'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import styles from './HeritagePostcard.module.css';

const EASE = [0.22, 1, 0.36, 1];
const COPY = {
  en: {
    facts: 'Explore the three heritage facts',
    story: 'Read the landmark story',
    settings: 'Language, story and sources',
    next: 'Discover',
    sources: 'Sources & photography',
    close: 'Close story',
    switchLanguage: 'Read in Arabic',
    artwork: 'Postcard artwork supplied for this experience.',
    readMore: 'Full story',
  },
  ar: {
    facts: 'اكتشف المعلومات التراثية الثلاث',
    story: 'اقرأ حكاية المعلم',
    settings: 'اللغة والحكاية والمصادر',
    next: 'اكتشف',
    sources: 'المصادر والصور',
    close: 'إغلاق الحكاية',
    switchLanguage: 'Read in English',
    artwork: 'تصميم البطاقة مقدم لهذه التجربة.',
    readMore: 'الحكاية كاملة',
  },
};

/**
 * The supplied complete postcard is the visual source of truth.
 * Its lettering, photographs, frame and card borders stay in one coordinate
 * system. Percentage-based buttons map onto the printed facts and footer.
 * All story data remains real, selectable HTML in the accessible reading layer.
 * New landmarks supply a postcard asset and its fact bounds in landmarkStories.
 */
export default function HeritagePostcard({ story }) {
  const [language, setLanguage] = useState('en');
  const [activeFact, setActiveFact] = useState(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const dialog = useRef(null);
  const opener = useRef(null);
  const storyId = useId();
  const headingId = useId();
  const dialogTitleId = useId();
  const postcard = story.postcard;
  const copy = COPY[language];
  const isArabic = language === 'ar';
  const fact = activeFact === null ? null : story.facts[activeFact];

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem('heritage-language');
      if (saved === 'ar' || saved === 'en') setLanguage(saved);
    } catch { /* Private browsing can disable session storage. */ }
    const reset = () => setLeaving(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const changeLanguage = () => {
    const next = isArabic ? 'en' : 'ar';
    setLanguage(next);
    try { window.sessionStorage.setItem('heritage-language', next); } catch { /* Optional preference. */ }
  };

  const openReader = (event, index = null) => {
    opener.current = event.currentTarget;
    setActiveFact(index);
    setReaderOpen(true);
    dialog.current?.showModal();
  };

  const closeReader = () => dialog.current?.close();
  const didClose = () => {
    setReaderOpen(false);
    opener.current?.focus({ preventScroll: true });
  };

  const nextDestination = (event) => {
    // Keep native new-tab, keyboard and modifier-key link behaviour.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || reducedMotion) return;
    event.preventDefault();
    if (leaving) return;
    setLeaving(true);
    const destination = event.currentTarget.href;
    window.setTimeout(() => window.location.assign(destination), 240);
  };

  return (
    <main className={styles.stage} lang={language}>
      <motion.article
        className={styles.postcard}
        aria-labelledby={headingId}
        data-landmark={story.kind}
        style={{ '--art-ratio': postcard.width / postcard.height, '--fact-top': `${postcard.factTop}%`, '--fact-height': `${postcard.factHeight}%` }}
        initial={false}
        animate={leaving ? { opacity: 0, y: -5, scale: 0.995 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: leaving ? 0.24 : 1.2, ease: EASE }}
      >
        <Image
          className={styles.artwork}
          src={postcard.src}
          alt=""
          aria-hidden="true"
          width={postcard.width}
          height={postcard.height}
          priority
          unoptimized
          draggable={false}
          onError={() => setLoadFailed(true)}
        />

        <div className={styles.screenReaderText}>
          <h1 id={headingId}><span lang="ar" dir="rtl">{story.title.ar}</span> · <span lang="en">{story.title.en}</span></h1>
          <p>{story.eyebrow[language]}</p>
          <p lang="ar" dir="rtl">{story.lead.ar}</p>
          <p lang="en">{story.lead.en}</p>
          <p>{story.hero.alt[language]}</p>
        </div>

        {loadFailed && <div className={styles.imageFallback}><h2>{story.title[language]}</h2><p>{story.lead[language]}</p><button onClick={openReader}>{copy.story}</button></div>}

        <div className={styles.factTargets} role="group" aria-label={copy.facts}>
          {story.facts.map((item, index) => (
            <button
              type="button"
              className={styles.factTarget}
              key={item.icon}
              aria-label={`${item.cardTitle?.[language] || item.value[language]} — ${item.label[language]}`}
              aria-haspopup="dialog"
              aria-controls={storyId}
              onClick={(event) => openReader(event, index)}
            >
              <span className={styles.factHint} aria-hidden="true">+</span>
            </button>
          ))}
        </div>

        <footer className={styles.footerTargets}>
          <button className={styles.footerTarget} type="button" aria-label={copy.story} aria-haspopup="dialog" aria-controls={storyId} onClick={openReader} />
          <button className={`${styles.footerTarget} ${styles.ornamentTarget}`} type="button" aria-label={copy.settings} aria-haspopup="dialog" aria-controls={storyId} onClick={openReader} />
          <Link className={styles.footerTarget} href={`/landmarks/${postcard.nextId}`} aria-label={`${copy.next} ${postcard.nextTitle[language]}`} onClick={nextDestination} />
        </footer>
      </motion.article>

      <dialog
        ref={dialog}
        id={storyId}
        className={styles.reader}
        dir={isArabic ? 'rtl' : 'ltr'}
        aria-labelledby={dialogTitleId}
        onClose={didClose}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeReader();
        }}
      >
        <header className={styles.readerHeader}>
          <div>
            <small>{story.reference}</small>
            <h2 id={dialogTitleId}>{fact?.cardTitle?.[language] || fact?.value[language] || story.title[language]}</h2>
          </div>
          <div className={styles.readerControls}>
            <button type="button" className={styles.language} aria-label={copy.switchLanguage} onClick={changeLanguage}>{isArabic ? 'EN' : 'العربية'}</button>
            <button type="button" className={styles.close} aria-label={copy.close} onClick={closeReader} autoFocus>×</button>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {readerOpen && <motion.div
            key={`${language}-${activeFact ?? 'story'}`}
            className={styles.readerBody}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            {fact ? (
              <section className={styles.expandedFact}>
                <p className={styles.factArabic} lang="ar" dir="rtl">{fact.cardTitle?.ar || fact.value.ar}</p>
                <p className={styles.factEnglish} lang="en" dir="ltr">{fact.cardTitle?.en || fact.value.en}</p>
                {fact.metric && <strong className={styles.metric} dir="ltr">{fact.value[language]}</strong>}
                <p>{fact.label[language]}</p>
              </section>
            ) : (
              <figure className={styles.readingPhoto}>
                <Image src={story.detail.src} alt={story.detail.alt[language]} width={800} height={520} sizes="(max-width: 600px) 90vw, 500px" />
                <figcaption>{story.detail.caption[language]}</figcaption>
              </figure>
            )}
            <div className={styles.storyText}>
              <p>{story.lead[language]}</p>
              <p>{story.paragraph[language]}</p>
            </div>
            {fact && <button className={styles.readFull} type="button" onClick={() => setActiveFact(null)}>{copy.readMore} <span aria-hidden="true">↗</span></button>}
            <details className={styles.sources}>
              <summary>{copy.sources}</summary>
              <ul>{story.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul>
              <ul>{story.credits.map(credit => <li key={credit.url}><a href={credit.url} target="_blank" rel="noreferrer">{credit.text}</a></li>)}</ul>
              <p>{copy.artwork}</p>
            </details>
          </motion.div>}
        </AnimatePresence>
      </dialog>
    </main>
  );
}
