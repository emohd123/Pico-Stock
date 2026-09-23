'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './report.module.css';
import { NAME_ART_BACKGROUNDS, NAME_ART_REPORT } from '@/lib/nameArt/config';

const POLL_MS = 10000;

const hourLabel = hour => `${hour % 12 || 12}${hour < 12 ? ' AM' : ' PM'}`;
const dayLabel = date => new Date(`${date}T12:00:00+03:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bahrain' });
const bahrainHourNow = () => (new Date().getUTCHours() + 3) % 24;

function ago(iso, now) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/* Counts up to each new value. requestAnimationFrame does not run in a background tab, so a
   timer lands it on the real number regardless - a report must never show a half-counted
   figure because the client opened it behind another tab. */
function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null) return undefined;
    const start = from.current, begun = performance.now();
    const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || start === value) { from.current = value; setShown(value); return undefined; }
    let frame;
    const step = time => {
      const k = Math.min(1, (time - begun) / ms), eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const settle = setTimeout(() => setShown(value), ms + 150);
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); from.current = value; };
  }, [value, ms]);
  return shown;
}

/* Fades a section in as it scrolls into view, with a timed fallback so nothing stays hidden
   if the observer never fires (old browsers, printing, a background tab). */
function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    const fallback = setTimeout(() => setInView(true), 1800);
    if (!node || !('IntersectionObserver' in window)) { setInView(true); return () => clearTimeout(fallback); }
    const io = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(node);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return <div ref={ref} className={`${styles.reveal} ${className}`} data-in={inView}>{children}</div>;
}

function Kpi({ label, value, text, note }) {
  const shown = useCountUp(value);
  return <div className={styles.kpi}><span>{label}</span><strong>{text ?? (value == null ? '—' : shown.toLocaleString('en-US'))}</strong><small>{note}</small></div>;
}

const JOURNEY = [
  { img: '/name-art/report/tablet-create.webp', pos: '58% 50%', title: 'Type a name', text: 'In English or Arabic, on the booth tablet. Four campaign designs and three calligraphy styles to choose from.' },
  { img: '/name-art/report/screen-countdown.webp', title: 'On the big screen in seconds', text: 'The poster goes straight onto the 2 m × 1 m LED wall, full height, with the name at its heart.', fit: 'contain' },
  { img: '/name-art/report/tablet-selfie.webp', pos: '62% 50%', title: 'Selfie countdown', text: 'Tablet and wall count down together so the guest can turn round and photograph their name. From 2 to 5 pm, it’s a selfie with the band.' },
  { img: '/name-art/report/phone-download.webp', bg: '#f7f1e6', title: 'Take it home', text: 'A personal QR opens the guest’s own poster on any phone, on any network, ready to download.', fit: 'contain' },
];

const DELIVERED = [
  ['Bilingual by design', 'English and Arabic names, each written in a matched pair of typefaces.'],
  ['The campaign’s own artwork', 'Four backdrops built on the منورة بشوفتكم identity, including the two-shores design.'],
  ['Made for the LED wall', 'Posters are rendered in the panel’s exact 1:2 shape and fill it edge to edge.'],
  ['A moment, not just a picture', 'Synced selfie countdown on tablet and wall, with a band-hours mode from 2 to 5 pm.'],
  ['Every guest leaves with it', 'A private download link per guest that works on mobile data - no app, no Wi-Fi needed.'],
  ['Built for a long day', 'Works offline, screens every name before it reaches the wall, and recovers by itself after a restart.'],
];

export default function NameArtReport() {
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true, timer;
    const load = async () => {
      try {
        const response = await fetch('/api/name-art/stats', { cache: 'no-store' });
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (alive) { setStats(data); setOffline(false); }
      } catch { if (alive) setOffline(true); }
      finally { if (alive) timer = setTimeout(load, POLL_MS); }
    };
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearTimeout(timer); clearInterval(tick); };
  }, []);

  const byHour = stats?.byHour || Array(24).fill(0);
  const peak = Math.max(0, ...byHour);
  const peakHour = peak ? byHour.indexOf(peak) : null;
  const scale = Math.max(peak, 4);                      // a quiet morning should not look like a spike
  const band = stats?.band || { from: 14, to: 17 };
  const designTotal = stats ? Object.values(stats.byDesign).reduce((a, b) => a + b, 0) : 0;
  const topDesign = stats && designTotal ? Object.entries(stats.byDesign).sort((a, b) => b[1] - a[1])[0][0] : null;
  const current = bahrainHourNow();
  const isToday = stats && stats.todayDate;

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div className={styles.wrap}>
        <div className={styles.topline}>
          <span className={styles.eyebrow}>{NAME_ART_REPORT.event} · {NAME_ART_REPORT.venue}</span>
          <span className={styles.live} data-state={offline ? 'offline' : 'live'}>
            <i />{offline ? 'Reconnecting…' : 'LIVE'}<small>{stats ? (stats.lastAt ? `last poster ${ago(stats.lastAt, now)}` : 'waiting for the first guest') : 'loading…'}</small>
          </span>
        </div>
        <h1 className={styles.title}>Name Art — live report</h1>
        <p className={styles.lede}>Guests type their name, watch it appear on the big screen within seconds, take a selfie with it and carry the poster home on their phone.</p>
        <p className={styles.lede} dir="rtl">اكتب اسمك، شاهده على الشاشة الكبيرة، التقط صورتك معه واحتفظ ببطاقتك</p>
        {stats?.liveNow && <div className={styles.onWall}><b />A guest’s name is on the big screen right now</div>}
      </div>
    </header>

    <div className={styles.wrap}>
      <section className={styles.kpis} aria-label="Headline numbers">
        <Kpi label="Posters created" value={stats?.total} note={`since ${dayLabel(NAME_ART_REPORT.from)}`} />
        <Kpi label="Shown on the LED wall" value={stats?.onWall} note={stats && stats.total ? `${Math.round(stats.onWall / stats.total * 100)}% of all posters` : 'names that reached the wall'} />
        <Kpi label="Created today" value={stats?.today} note={isToday ? dayLabel(stats.todayDate) : 'today'} />
        <Kpi label="Busiest hour today" text={peakHour != null ? hourLabel(peakHour) : '—'} note={peakHour != null ? `${peak} poster${peak === 1 ? '' : 's'} in that hour` : 'waiting for the first guest'} />
      </section>

      <Reveal className={styles.section}>
        <h2 className={styles.h2}>Today, hour by hour</h2>
        <p className={styles.sub}>
          Posters created each hour, Bahrain time{peakHour != null ? ` — busiest so far ${hourLabel(peakHour)} with ${peak}` : ''}.
          {stats?.bandHours ? ` ${stats.bandHours} created during the band’s set.` : ''}
        </p>
        <div className={styles.panel}>
          <div className={styles.chart} role="img" aria-label={`Posters per hour today; busiest ${peakHour != null ? hourLabel(peakHour) : 'none yet'}`}>
            <div className={styles.bandZone} style={{ left: `${band.from / 24 * 100}%`, width: `${(band.to - band.from) / 24 * 100}%` }}><em>Live band</em></div>
            {byHour.map((count, hour) => <div key={hour} className={styles.col} data-empty={!count} data-now={hour === current && !!stats}>
              <div className={styles.track}>
                <span className={styles.count}>{count || ''}</span>
                <div className={styles.bar} style={{ height: stats ? `${count / scale * 88}%` : '0%' }} />
              </div>
              <span className={styles.hour}>{hour % 3 === 0 ? hourLabel(hour).replace(' ', '') : ''}</span>
            </div>)}
          </div>
          <div className={styles.legend}>
            <span><b style={{ background: 'linear-gradient(#35d07f,#1f9a5c)' }} />Posters created</span>
            <span><b style={{ background: '#e2477a33', border: '1px dashed #e2477a' }} />Live band, {hourLabel(band.from)}–{hourLabel(band.to)}</span>
            <span><b style={{ background: '#fff', boxShadow: '0 0 0 2px #d9a93f' }} />Current hour</span>
          </div>
          {stats?.byDay?.length > 1 && <div className={styles.days}>
            {stats.byDay.map(day => <div key={day.date} className={styles.day}><b>{day.count}</b>{dayLabel(day.date)}</div>)}
          </div>}
        </div>
      </Reveal>

      <Reveal className={styles.section}>
        <h2 className={styles.h2}>Designs guests chose</h2>
        <p className={styles.sub}>Each guest picks one of four backdrops drawn from the campaign’s artwork.</p>
        <div className={styles.designs}>
          {NAME_ART_BACKGROUNDS.map(design => {
            const count = stats?.byDesign?.[design.id] || 0, share = designTotal ? Math.round(count / designTotal * 100) : 0;
            return <div key={design.id} className={styles.design} data-top={design.id === topDesign}>
              <img src={design.src} alt="" loading="lazy" />
              <div><h3>{design.name}</h3><p>{count} poster{count === 1 ? '' : 's'} · {share}%</p>
                <div className={styles.meter}><i style={{ width: stats ? `${share}%` : '0%' }} /></div></div>
            </div>;
          })}
        </div>
      </Reveal>

      <Reveal className={styles.section}>
        <h2 className={styles.h2}>The guest experience</h2>
        <p className={styles.sub}>Four steps, about half a minute from start to finish.</p>
        <div className={styles.journey}>
          {JOURNEY.map((step, index) => <div key={step.title} className={styles.step}>
            <div className={styles.shot} data-fit={step.fit || 'cover'} style={step.bg ? { background: step.bg } : undefined}>
              <img src={step.img} alt={step.title} loading="lazy" style={step.pos ? { objectPosition: step.pos } : undefined} />
              <span className={styles.stepNo}>{index + 1}</span>
            </div>
            <h3>{step.title}</h3><p>{step.text}</p>
          </div>)}
        </div>
      </Reveal>

      <Reveal className={styles.section}>
        <h2 className={styles.h2}>What we delivered</h2>
        <p className={styles.sub}>Designed, built and run for the day.</p>
        <div className={styles.features}>
          {DELIVERED.map(([title, text]) => <div key={title} className={styles.feature}><b>{title}</b><span>{text}</span></div>)}
        </div>
      </Reveal>

      <footer className={styles.foot}>
        <span><strong>Live data</strong> — refreshes every 10 seconds. Counting from {dayLabel(NAME_ART_REPORT.from)}, Bahrain time.</span>
        <span>Guest names are never shown in this report. Posters are deleted after 48 hours.</span>
      </footer>
    </div>
  </main>;
}
