'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import CompanyContactForm from '@/components/CompanyContactForm';

// ─── Intro / Loading screen ────────────────────────────────────────────────
function IntroScreen({ onDone }) {
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState('loading');

    useEffect(() => {
        let raf;
        const start = performance.now();
        const dur = 1800;
        const tick = (now) => {
            const p = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 2);
            setProgress(Math.round(eased * 100));
            if (p < 1) { raf = requestAnimationFrame(tick); }
            else { setPhase('done'); setTimeout(onDone, 600); }
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [onDone]);

    return (
        <motion.div className="cpv2-intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
            <div className="cpv2-intro-bg" />
            <div className="cpv2-intro-inner">
                <motion.div className="cpv2-intro-logo"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                >
                    <span className="cpv2-intro-pico">PICO</span>
                    <span className="cpv2-intro-bh">BAHRAIN</span>
                </motion.div>
                <motion.div className="cpv2-intro-bar-wrap"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
                    <div className="cpv2-intro-bar">
                        <motion.div className="cpv2-intro-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="cpv2-intro-meta">
                        <span className="cpv2-intro-status">{phase === 'done' ? 'READY' : 'LOADING PROFILE'}</span>
                        <span className="cpv2-intro-pct">{progress}%</span>
                    </div>
                </motion.div>
                <motion.p className="cpv2-intro-tagline"
                    initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.5 }}>
                    Exhibition · Events · Interiors
                </motion.p>
            </div>
        </motion.div>
    );
}

// ─── 3D section transition variants ───────────────────────────────────────
const sectionVariants = {
    enter: (dir) => ({
        y: dir > 0 ? '100%' : '-100%',
        opacity: 0,
        scale: 0.94,
        rotateX: dir > 0 ? 8 : -8,
        filter: 'blur(6px)',
    }),
    center: {
        y: 0,
        opacity: 1,
        scale: 1,
        rotateX: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] },
    },
    exit: (dir) => ({
        y: dir < 0 ? '100%' : '-100%',
        opacity: 0,
        scale: 0.94,
        rotateX: dir < 0 ? 8 : -8,
        filter: 'blur(6px)',
        transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
    }),
};

// ─── Animated counter ─────────────────────────────────────────────────────
function Counter({ to, suffix = '', active }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!active) { setVal(0); return; }
        const start = performance.now();
        const dur = 1800;
        const tick = (now) => {
            const p = Math.min((now - start) / dur, 1);
            setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
            if (p < 1) requestAnimationFrame(tick);
        };
        const id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [active, to]);
    return <>{val}{suffix}</>;
}

// ─── Floating image ────────────────────────────────────────────────────────
function FloatingImg({ src, alt, className, delay = 0, fy = 14, fx = 8 }) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{
                opacity: 1, scale: 1,
                y: [0, -fy, 0, fy * 0.5, 0],
                x: [0, fx * 0.5, 0, -fx * 0.3, 0],
                rotate: [0, 0.5, 0, -0.4, 0],
            }}
            transition={{
                opacity: { duration: 0.8, delay },
                scale: { duration: 0.8, delay },
                y: { duration: 7 + delay * 2, repeat: Infinity, ease: 'easeInOut', delay: delay * 0.4 },
                x: { duration: 9 + delay * 2, repeat: Infinity, ease: 'easeInOut', delay: delay * 0.2 },
                rotate: { duration: 11 + delay, repeat: Infinity, ease: 'easeInOut' },
            }}
        >
            <div className="cpv2-float-inner cpv2-hud-frame">
                <Image src={src} alt={alt} fill sizes="30vw" className="cpv2-img" priority={delay < 0.6} />
                <div className="cpv2-float-overlay" />
            </div>
        </motion.div>
    );
}

// ─── Section 0: Hero ──────────────────────────────────────────────────────
function SectionHero() {
    return (
        <div className="cpv2-sec cpv2-sec-hero">
            <div className="cpv2-hero-bg">
                <div className="cpv2-orb cpv2-orb-1" />
                <div className="cpv2-orb cpv2-orb-2" />
                <div className="cpv2-orb cpv2-orb-3" />
                <div className="cpv2-grid-lines" />
            </div>
            <div className="cpv2-hero-inner">
                <motion.div className="cpv2-hero-copy"
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                    <span className="cpv2-eyebrow">Pico Bahrain — Company Profile</span>
                    <h1 className="cpv2-headline">
                        Exhibition,<br />
                        Event &amp;<br />
                        <span className="cpv2-accent">Interior</span><br />
                        Solutions.
                    </h1>
                    <p className="cpv2-hero-sub">
                        Turning physical spaces into professional brand experiences — prepared
                        for visitors, presentations, and live interaction.
                    </p>
                    <div className="cpv2-hero-actions">
                        <Link href="/catalogue" className="cpv2-btn cpv2-btn-primary">Explore Catalogue</Link>
                        <a href="#" onClick={e => e.preventDefault()} className="cpv2-btn cpv2-btn-ghost">Start a Project ↓</a>
                    </div>
                    <div className="cpv2-hero-mini-stats">
                        {[['25+','Years Global'],['500+','Projects'],['120+','Clients']].map(([n,l],i) => (
                            <div key={l} className="cpv2-mini-stat-wrap">
                                {i > 0 && <div className="cpv2-mini-divider" />}
                                <div className="cpv2-mini-stat">
                                    <span className="cpv2-mini-num">{n}</span>
                                    <span className="cpv2-mini-label">{l}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
                <div className="cpv2-float-stage">
                    <FloatingImg src="/company-profile/exhibition-main.jpeg" alt="Exhibition stand" className="cpv2-fimg cpv2-fimg-main" delay={0.3} fy={14} fx={6} />
                    <FloatingImg src="/company-profile/events-main.jpeg" alt="Event" className="cpv2-fimg cpv2-fimg-top" delay={0.55} fy={10} fx={9} />
                    <FloatingImg src="/company-profile/interior-main.jpeg" alt="Interior" className="cpv2-fimg cpv2-fimg-bot" delay={0.75} fy={16} fx={5} />
                    <FloatingImg src="/company-profile/conference-main.jpg" alt="Conference" className="cpv2-fimg cpv2-fimg-far" delay={0.95} fy={12} fx={11} />
                    <div className="cpv2-float-glow" />
                </div>
            </div>
            <motion.div className="cpv2-scroll-hint"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
                <span className="cpv2-scroll-line" />
                <span className="cpv2-scroll-label">Scroll</span>
            </motion.div>
        </div>
    );
}

// ─── Section 1: About (tabbed — all PPTX slides) ─────────────────────────
const ABOUT_TABS = [
    { id: 'story',    label: 'Our Story',  img: '/company-profile/conference-main.jpg' },
    { id: 'vision',   label: 'Direction',  img: '/company-profile/interior-alt.jpg' },
    { id: 'presence', label: 'Presence',   img: '/company-profile/exhibition-main.jpeg' },
    { id: 'expertise',label: 'Expertise',  img: '/company-profile/events-main.jpeg' },
];

const tabVariants = {
    enter:  { opacity: 0, y: 16 },
    center: { opacity: 1, y: 0,  transition: { duration: 0.42, ease: [0.22,1,0.36,1] } },
    exit:   { opacity: 0, y: -10, transition: { duration: 0.22 } },
};

function SectionAbout({ active }) {
    const [tab, setTab] = useState(0);

    return (
        <div className="cpv2-sec cpv2-sec-about">
            {/* Left — photo changes per tab */}
            <div className="cpv2-about-img-side">
                <AnimatePresence mode="sync">
                    <motion.div key={tab} className="cpv2-who-img-frame"
                        initial={{ opacity: 0, scale: 1.06 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <Image src={ABOUT_TABS[tab].img} alt="Pico Bahrain" fill sizes="45vw" className="cpv2-img" />
                    </motion.div>
                </AnimatePresence>
                <div className="cpv2-who-img-grad" />
                {/* Tab indicator overlay */}
                <AnimatePresence mode="sync">
                    <motion.div key={`lbl-${tab}`} className="cpv2-about-img-lbl"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                        <span className="cpv2-about-img-lbl-num">0{tab + 1}</span>
                        <span className="cpv2-about-img-lbl-text">{ABOUT_TABS[tab].label}</span>
                    </motion.div>
                </AnimatePresence>
                <motion.div className="cpv2-who-badge"
                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.45, type: 'spring', stiffness: 180 }}>
                    <span className="cpv2-badge-big">1999</span>
                    <span className="cpv2-badge-txt">Est. in Bahrain</span>
                </motion.div>
            </div>

            {/* Right — tabs */}
            <div className="cpv2-about-copy-side">
                <motion.span className="cpv2-section-tag"
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    About Pico Bahrain
                </motion.span>
                <motion.h2 className="cpv2-about-title"
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                    Total Brand<br /><span className="cpv2-accent">Activation.</span>
                </motion.h2>

                {/* Tab pill nav */}
                <motion.div className="cpv2-tab-pills"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
                    {ABOUT_TABS.map((t, i) => (
                        <button key={t.id}
                            className={`cpv2-tab-pill ${i === tab ? 'cpv2-tab-pill-active' : ''}`}
                            onClick={() => setTab(i)}>
                            {t.label}
                        </button>
                    ))}
                </motion.div>

                {/* Animated tab body */}
                <div className="cpv2-tab-body">
                    <AnimatePresence mode="sync">
                        <motion.div key={tab} variants={tabVariants}
                            initial="enter" animate="center" exit="exit">

                            {tab === 0 && (
                                <div className="cpv2-tab-story">
                                    <p className="cpv2-tab-para">Established <strong>May 1999</strong> — the 22nd office in Pico Group&apos;s global network and the second in the Middle East. Operating from a <strong>3,500 sqm</strong> facility with full exhibition, event, and AV inventory.</p>
                                    <div className="cpv2-tab-mini-stats">
                                        {[
                                            { v: 36,  s: '',  p: '',    l: 'Cities Worldwide' },
                                            { v: 590, s: 'M', p: 'US$', l: 'Project Value' },
                                            { v: 417, s: 'M', p: 'US$', l: 'Group Turnover' },
                                            { v: 50,  s: '+', p: '',    l: 'Team Members' },
                                        ].map((st, i) => (
                                            <div key={st.l} className="cpv2-tab-mini-stat">
                                                <span className="cpv2-tab-mini-num">
                                                    {st.p}<Counter to={st.v} suffix={st.s} active={active} />
                                                </span>
                                                <span className="cpv2-tab-mini-lbl">{st.l}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="cpv2-story-timeline">
                                        {[
                                            { year: '1999', event: 'Established in Bahrain' },
                                            { year: '2001', event: '2nd Middle East office' },
                                            { year: '2010', event: 'Expanded to 3,500 sqm' },
                                            { year: 'Now',  event: '25+ years of excellence' },
                                        ].map((m, i) => (
                                            <motion.div key={m.year} className="cpv2-timeline-step"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.3 + i * 0.08 }}>
                                                <span className="cpv2-tl-year">{m.year}</span>
                                                <span className="cpv2-tl-dot" />
                                                <span className="cpv2-tl-event">{m.event}</span>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tab === 1 && (
                                <div className="cpv2-tab-direction">
                                    {[
                                        { icon: "◈", title: "Vision",  text: "A world-class company reputable for building clients’ image through exceptional brand experiences.", tag: "Where we aim to be" },
                                        { icon: "◎", title: "Mission", text: "High-quality creative services through the efficient deployment of the best global resources available.", tag: "How we operate" },
                                        { icon: "◉", title: "Promise", text: "Total Brand Activation — creating immersive experiences that elevate brands and leave lasting impressions.", tag: "What we deliver" },
                                    ].map((item, i) => (
                                        <motion.div key={item.title} className="cpv2-dir-card"
                                            initial={{ opacity: 0, x: -16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: 0.4, delay: i * 0.1, ease: [0.22,1,0.36,1] }}>
                                            <span className="cpv2-dir-icon">{item.icon}</span>
                                            <div className="cpv2-dir-body">
                                                <div className="cpv2-dir-header">
                                                    <h4 className="cpv2-dir-title">{item.title}</h4>
                                                    <span className="cpv2-dir-tag">{item.tag}</span>
                                                </div>
                                                <p className="cpv2-dir-text">{item.text}</p>
                                            </div>
                                        </motion.div>
                                    ))}
                                    <motion.div className="cpv2-dir-footer"
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                                        <span className="cpv2-dir-footer-line" />
                                        <span className="cpv2-dir-footer-txt">Pico Bahrain &mdash; Guiding principles since 1999</span>
                                        <span className="cpv2-dir-footer-line" />
                                    </motion.div>
                                </div>
                            )}

                            {tab === 2 && (
                                <div className="cpv2-tab-presence">
                                    <div className="cpv2-presence-hero">
                                        <span className="cpv2-presence-big">
                                            <Counter to={36} suffix="" active={active} />
                                        </span>
                                        <div className="cpv2-presence-hero-right">
                                            <span className="cpv2-presence-unit">Cities</span>
                                            <span className="cpv2-presence-sub">Pico Group Worldwide</span>
                                        </div>
                                    </div>
                                    <p className="cpv2-tab-para" style={{ marginTop: '0.5rem' }}>A global network spanning 5 continents — combining the scale of an international brand with the precision of local execution in every market.</p>
                                    <div className="cpv2-presence-bars">
                                        {[
                                            { region: 'Asia Pacific',  offices: 18, pct: 50 },
                                            { region: 'Middle East',   offices: 8,  pct: 22 },
                                            { region: 'Europe',        offices: 5,  pct: 14 },
                                            { region: 'Americas',      offices: 3,  pct: 8  },
                                            { region: 'Africa',        offices: 2,  pct: 6  },
                                        ].map((r, i) => (
                                            <motion.div key={r.region} className="cpv2-pbar-row"
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.15 + i * 0.08 }}>
                                                <div className="cpv2-pbar-meta">
                                                    <span className="cpv2-pbar-label">{r.region}</span>
                                                    <span className="cpv2-pbar-count">{r.offices} offices</span>
                                                </div>
                                                <div className="cpv2-pbar-track">
                                                    <motion.div className="cpv2-pbar-fill"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${r.pct}%` }}
                                                        transition={{ duration: 0.7, delay: 0.25 + i * 0.08, ease: [0.22,1,0.36,1] }} />
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tab === 3 && (
                                <div className="cpv2-tab-expertise">
                                    <div className="cpv2-exp-cols">
                                        <div className="cpv2-exp-col">
                                            <h5 className="cpv2-exp-heading">Experience Types</h5>
                                            {[
                                                { s: 'Interactive Technology', i: '01' },
                                                { s: 'Brand Strategy',         i: '02' },
                                                { s: 'Experiential Marketing', i: '03' },
                                                { s: 'Digital & Social',       i: '04' },
                                                { s: 'PR & Communications',    i: '05' },
                                            ].map(({ s, i: idx }, i) => (
                                                <motion.div key={s} className="cpv2-exp-item"
                                                    initial={{ opacity: 0, x: -12 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.07, duration: 0.35 }}>
                                                    <span className="cpv2-exp-idx">{idx}</span>
                                                    <span className="cpv2-exp-dot" />{s}
                                                </motion.div>
                                            ))}
                                        </div>
                                        <div className="cpv2-exp-col">
                                            <h5 className="cpv2-exp-heading">Service Categories</h5>
                                            {[
                                                { s: 'Visual Branding',       i: '01' },
                                                { s: 'World Expo',            i: '02' },
                                                { s: 'Sports Events',         i: '03' },
                                                { s: 'Exhibition Marketing',  i: '04' },
                                                { s: 'Themed Attractions',    i: '05' },
                                                { s: 'Interior & Retail',     i: '06' },
                                                { s: 'Event Marketing',       i: '07' },
                                            ].map(({ s, i: idx }, i) => (
                                                <motion.div key={s} className="cpv2-exp-item"
                                                    initial={{ opacity: 0, x: -12 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.06, duration: 0.35 }}>
                                                    <span className="cpv2-exp-idx">{idx}</span>
                                                    <span className="cpv2-exp-dot" />{s}
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                    <motion.div className="cpv2-exp-footer"
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                                        <span className="cpv2-exp-footer-stat"><strong>25+</strong> years delivering brand experiences</span>
                                        <span className="cpv2-exp-footer-divider" />
                                        <span className="cpv2-exp-footer-stat"><strong>12</strong> service categories</span>
                                        <span className="cpv2-exp-footer-divider" />
                                        <span className="cpv2-exp-footer-stat"><strong>36</strong> cities worldwide</span>
                                    </motion.div>
                                </div>
                            )}

                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Progress dots */}
                <div className="cpv2-tab-progress">
                    {ABOUT_TABS.map((_, i) => (
                        <button key={i}
                            className={`cpv2-tab-prog-dot ${i === tab ? 'cpv2-tab-prog-active' : ''}`}
                            onClick={() => setTab(i)} aria-label={ABOUT_TABS[i].label} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Section 3: Services ──────────────────────────────────────────────────
function SectionServices() {
    const [active, setActive] = useState(0);
    const svcs = [
        { title: 'Exhibition Stands',    img: '/company-profile/exhibition-main.jpeg', desc: 'Design-led stands for trade shows and live events.' },
        { title: 'Event Environments',   img: '/company-profile/events-main.jpeg',     desc: 'Hospitality, feature areas, and presentation spaces.' },
        { title: 'Interiors & Fit-Out',  img: '/company-profile/interior-main.jpeg',   desc: 'Branded receptions, lounges, and functional spaces.' },
        { title: 'Booth Furniture',      imgs: ['/company-profile/furn-armchair.jpg', '/company-profile/furn-chair.jpg', '/company-profile/furn-table.jpg', '/company-profile/furn-sofa.jpg'], desc: 'Flexible rental to complete exhibition spaces.' },
        { title: 'Graphics & Signage',   img: '/company-profile/events-alt.jpeg',      desc: 'Booth graphics, surfaces, and wayfinding.' },
        { title: 'AV & Digital Display', img: '/company-profile/av-digital-main.jpg',  desc: 'Screens, digital content, and display moments.' },
    ];
    return (
        <div className="cpv2-sec cpv2-sec-services">
            <div className="cpv2-svc-image-panel">
                <AnimatePresence mode="wait">
                    <motion.div key={active} className="cpv2-svc-image-wrap"
                        initial={{ opacity: 0, scale: 1.04 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {svcs[active].imgs ? (
                            <div style={{ position: 'absolute', inset: 0, background: '#080c14' }}>
                                {/* Main — left centre */}
                                <div style={{ position:'absolute', left:'6%', top:'10%', width:'44%', height:'52%', borderRadius:'18px', overflow:'hidden', background:'#f5f5f5', boxShadow:'0 20px 56px rgba(0,0,0,0.55)', border:'1px solid rgba(255,255,255,0.08)', zIndex:3 }}>
                                    <Image src={svcs[active].imgs[0]} alt="Booth Furniture" fill sizes="22vw" style={{ objectFit:'contain', padding:'12px' }} />
                                </div>
                                {/* Top right */}
                                <div style={{ position:'absolute', right:'4%', top:'5%', width:'38%', height:'44%', borderRadius:'16px', overflow:'hidden', background:'#f5f5f5', boxShadow:'0 16px 44px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', zIndex:4 }}>
                                    <Image src={svcs[active].imgs[1]} alt="Booth Furniture" fill sizes="20vw" style={{ objectFit:'contain', padding:'12px' }} />
                                </div>
                                {/* Bottom left */}
                                <div style={{ position:'absolute', left:'2%', bottom:'5%', width:'34%', height:'38%', borderRadius:'16px', overflow:'hidden', background:'#f5f5f5', boxShadow:'0 14px 40px rgba(0,0,0,0.45)', border:'1px solid rgba(255,255,255,0.08)', zIndex:2, opacity:0.9 }}>
                                    <Image src={svcs[active].imgs[3]} alt="Booth Furniture" fill sizes="18vw" style={{ objectFit:'contain', padding:'10px' }} />
                                </div>
                                {/* Bottom right */}
                                <div style={{ position:'absolute', right:'4%', bottom:'5%', width:'38%', height:'40%', borderRadius:'16px', overflow:'hidden', background:'#f5f5f5', boxShadow:'0 16px 44px rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', zIndex:2 }}>
                                    <Image src={svcs[active].imgs[2]} alt="Booth Furniture" fill sizes="20vw" style={{ objectFit:'contain', padding:'10px' }} />
                                </div>
                            </div>
                        ) : (
                            <Image src={svcs[active].img} alt={svcs[active].title} fill sizes="50vw" className="cpv2-img" />
                        )}
                        <div className="cpv2-svc-panel-grad" />
                    </motion.div>
                </AnimatePresence>
                <div className="cpv2-svc-panel-label">
                    <span className="cpv2-svc-panel-num">0{active + 1}</span>
                    <span className="cpv2-svc-panel-desc">{svcs[active].desc}</span>
                </div>
            </div>
            <div className="cpv2-svc-list-panel">
                <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                    <span className="cpv2-section-tag">What We Do</span>
                    <h2 className="cpv2-section-title" style={{ marginTop: '0.75rem' }}>
                        Six capabilities.<br /><span className="cpv2-accent">One seamless team.</span>
                    </h2>
                </motion.div>
                <div className="cpv2-svc-list">
                    {svcs.map((s, i) => (
                        <motion.div key={s.title}
                            className={`cpv2-svc-row ${i === active ? 'cpv2-svc-row-active' : ''}`}
                            onMouseEnter={() => setActive(i)}
                            initial={{ opacity: 0, x: 24 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <span className="cpv2-svc-row-num">0{i + 1}</span>
                            <span className="cpv2-svc-row-title">{s.title}</span>
                            <span className="cpv2-svc-row-arrow">→</span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Section 4: Portfolio ─────────────────────────────────────────────────
function SectionPortfolio() {
    const [hovered, setHovered] = useState(null);
    const items = [
        { title: 'Events Portfolio', sub: 'Live Event Environments', img: '/company-profile/events-main.jpeg' },
        { title: 'Exhibition Stands', sub: 'Stand Design & Build', img: '/company-profile/exhibition-main.jpeg' },
        { title: 'Interiors', sub: 'Interior & Fit-Out', img: '/company-profile/interior-main.jpeg' },
        { title: 'AV & Digital Display', sub: 'Graduation Ceremonies', img: '/company-profile/av-digital-main.jpg' },
    ];
    return (
        <div className="cpv2-sec cpv2-sec-portfolio">
            <motion.div className="cpv2-portfolio-head"
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <span className="cpv2-section-tag">Portfolio</span>
                <h2 className="cpv2-section-title">Work that speaks<br /><span className="cpv2-accent">for itself.</span></h2>
            </motion.div>
            <div className="cpv2-bento">
                <motion.div className="cpv2-bento-large"
                    initial={{ opacity: 0, scale: 0.93 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    onHoverStart={() => setHovered(0)} onHoverEnd={() => setHovered(null)}
                >
                    <Image src={items[0].img} alt={items[0].title} fill sizes="55vw" className="cpv2-img cpv2-img-top" />
                    <motion.div className="cpv2-bento-info"
                        animate={{ y: hovered === 0 ? 0 : 12, opacity: hovered === 0 ? 1 : 0.72 }}>
                        <span className="cpv2-bento-tag">{items[0].title}</span>
                        <h3 className="cpv2-bento-title">{items[0].sub}</h3>
                        <button onClick={() => window.dispatchEvent(new CustomEvent('cp-go-contact'))} className="cpv2-btn cpv2-btn-sm">Request Portfolio</button>
                    </motion.div>
                </motion.div>
                <div className="cpv2-bento-right">
                    {items.slice(1).map((item, i) => (
                        <motion.div key={item.title} className="cpv2-bento-sm"
                            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                            onHoverStart={() => setHovered(i + 1)} onHoverEnd={() => setHovered(null)}
                        >
                            <Image src={item.img} alt={item.title} fill sizes="42vw" className="cpv2-img" />
                            <motion.div className="cpv2-bento-info"
                                animate={{ y: hovered === i + 1 ? 0 : 12, opacity: hovered === i + 1 ? 1 : 0.72 }}>
                                <span className="cpv2-bento-tag">{item.title}</span>
                                <h3 className="cpv2-bento-title">{item.sub}</h3>
                                <button onClick={() => window.dispatchEvent(new CustomEvent('cp-go-contact'))} className="cpv2-btn cpv2-btn-sm">Request Portfolio</button>
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Section 5: Why Work With Us ──────────────────────────────────────────
function SectionWhy() {
    const items = [
        { num: '01', title: 'Local Bahrain Coordination', desc: 'Event-ready execution with deep regional knowledge and reliable on-ground delivery.' },
        { num: '02', title: 'Integrated Support', desc: 'Space design, rental, graphics, and finishes — all from one team, one handshake.' },
        { num: '03', title: 'Design-to-Delivery', desc: 'Concept to setup with fewer handoffs and less complexity for your internal team.' },
        { num: '04', title: 'Flexible Capability', desc: 'Exhibitions, events, interiors, and booth requirements handled under one roof.' },
    ];
    return (
        <div className="cpv2-sec cpv2-sec-why">
            <div className="cpv2-why-bg-img">
                <Image src="/company-profile/exhibition-main.jpeg" alt="" fill sizes="100vw" className="cpv2-img" />
                <div className="cpv2-why-bg-mask" />
            </div>
            <div className="cpv2-why-inner">
                <motion.div className="cpv2-why-head"
                    initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <span className="cpv2-section-tag">Why Pico Bahrain</span>
                    <h2 className="cpv2-section-title">The difference is<br /><span className="cpv2-accent">in the delivery.</span></h2>
                </motion.div>
                <div className="cpv2-why-grid">
                    {items.map((b, i) => (
                        <motion.div key={b.num} className="cpv2-why-card"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.65, delay: 0.2 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <span className="cpv2-why-num">{b.num}</span>
                            <div className="cpv2-why-line" />
                            <h3 className="cpv2-why-title">{b.title}</h3>
                            <p className="cpv2-why-desc">{b.desc}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Section 6: Contact ───────────────────────────────────────────────────
function SectionContact() {
    return (
        <div id="contact" className="cpv2-sec cpv2-sec-contact">
            <div className="cpv2-contact-inner">
                <motion.div className="cpv2-contact-copy"
                    initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
                    <span className="cpv2-section-tag">Get In Touch</span>
                    <h2 className="cpv2-contact-title">
                        Let&apos;s build your next<br /><span className="cpv2-accent">brand experience.</span>
                    </h2>
                    <p className="cpv2-contact-sub">
                        Share your event, stand, or interior requirement and our Bahrain team
                        will respond with the right approach.
                    </p>
                    <div className="cpv2-contact-links">
                        {[
                            { href: 'tel:+97336357377', label: '+973 3635 7377' },
                            { href: 'mailto:ebrahim@picobahrain.com', label: 'ebrahim@picobahrain.com' },
                            { href: 'https://instagram.com/picobahrain', label: 'Instagram', ext: true },
                        ].map(l => (
                            <a key={l.label} href={l.href} target={l.ext ? '_blank' : undefined}
                                rel={l.ext ? 'noopener noreferrer' : undefined} className="cpv2-contact-link">
                                <span className="cpv2-contact-icon">↗</span>{l.label}
                            </a>
                        ))}
                    </div>
                    <Link href="/catalogue" className="cpv2-btn cpv2-btn-outline" style={{ marginTop: '1.5rem' }}>
                        Browse Catalogue
                    </Link>
                </motion.div>
                <motion.div className="cpv2-form-card"
                    initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="cpv2-form-hdr">
                        <h3>Project Inquiry</h3>
                        <p>Send your brief — we&apos;ll route it to our team.</p>
                    </div>
                    <CompanyContactForm />
                </motion.div>
            </div>
        </div>
    );
}

// ─── Section config ───────────────────────────────────────────────────────
const SECTION_LABELS = ['Home', 'About', 'Services', 'Portfolio', 'Why Us', 'Contact'];

// ─── Main page ────────────────────────────────────────────────────────────
export default function CompanyProfilePage() {
    const [intro, setIntro] = useState(true);
    const [current, setCurrent] = useState(0);
    const [dir, setDir] = useState(1);
    const [busy, setBusy] = useState(false);
    const TOTAL = 6;
    const doneIntro = useCallback(() => setIntro(false), []);

    const go = useCallback((next) => {
        if (busy || next < 0 || next >= TOTAL) return;
        setDir(next > current ? 1 : -1);
        setCurrent(next);
        setBusy(true);
        setTimeout(() => setBusy(false), 950);
    }, [busy, current, TOTAL]);

    useEffect(() => {
        let acc = 0, last = 0;
        const onWheel = (e) => {
            e.preventDefault();
            const now = Date.now();
            if (now - last < 60) { acc += e.deltaY; } else { acc = e.deltaY; }
            last = now;
            if (Math.abs(acc) > 80) { go(current + (acc > 0 ? 1 : -1)); acc = 0; }
        };
        window.addEventListener('wheel', onWheel, { passive: false });
        return () => window.removeEventListener('wheel', onWheel);
    }, [go, current]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'ArrowDown' || e.key === 'PageDown') go(current + 1);
            if (e.key === 'ArrowUp' || e.key === 'PageUp') go(current - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, current]);

    useEffect(() => {
        let startY = 0;
        const onTouchStart = (e) => { startY = e.touches[0].clientY; };
        const onTouchEnd = (e) => {
            const diff = startY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 50) go(current + (diff > 0 ? 1 : -1));
        };
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => { window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd); };
    }, [go, current]);

    useEffect(() => {
        const handler = () => go(5);
        window.addEventListener('cp-go-contact', handler);
        return () => window.removeEventListener('cp-go-contact', handler);
    }, [go]);

    const sections = [
        <SectionHero key="hero" />,
        <SectionAbout key="about" active={current === 1} />,
        <SectionServices key="services" />,
        <SectionPortfolio key="portfolio" />,
        <SectionWhy key="why" />,
        <SectionContact key="contact" />,
    ];

    return (
        <>
            <AnimatePresence>
                {intro && <IntroScreen key="intro" onDone={doneIntro} />}
            </AnimatePresence>
            <div className="cpv2-root">
                <div className="cpv2-stage">
                    <AnimatePresence mode="wait" custom={dir}>
                        <motion.div
                            key={current}
                            custom={dir}
                            variants={sectionVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="cpv2-motion-wrap"
                            style={{ perspective: '1200px' }}
                        >
                            {sections[current]}
                        </motion.div>
                    </AnimatePresence>
                </div>
                <nav className="cpv2-nav-dots" aria-label="Section navigation">
                    {SECTION_LABELS.map((label, i) => (
                        <button key={label}
                            className={`cpv2-dot ${i === current ? 'cpv2-dot-active' : ''}`}
                            onClick={() => go(i)} aria-label={label} title={label}>
                            <span className="cpv2-dot-inner" />
                            <span className="cpv2-dot-label">{label}</span>
                        </button>
                    ))}
                </nav>
                <div className="cpv2-arrows">
                    <button className="cpv2-arrow" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous">↑</button>
                    <button className="cpv2-arrow" onClick={() => go(current + 1)} disabled={current === TOTAL - 1} aria-label="Next">↓</button>
                </div>
            </div>
        </>
    );
}
