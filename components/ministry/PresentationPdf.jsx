import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { CATALOG } from '@/lib/ministry/catalog';
import {
    CARD_SECTIONS, OVERVIEW_CATEGORIES, HEAD_TABLE_NO, BACKDROP_NOS,
    LED_NO, SOUND_NOS, CONFERENCE_NOS, SERVICES_NO,
} from '@/lib/ministry/presentationAssets';

// Auto-generated "Technical Proposal" deck (A4 landscape PDF), built from a
// ministry's latest quotation. Admin-only. Structure mirrors the approved
// reference deck.

const INK = '#22282B';
const TEAL = '#00857A';
const MINT = '#00C7B1';
const MUTED = '#6B7A80';
const CARD = '#F5F8F8';
const LINE = '#E3EAEA';
const PW = 842, PH = 595;

const CATALOG_BY_NO = new Map(CATALOG.map((c) => [c.itemNo, c]));

const s = StyleSheet.create({
    dark: { backgroundColor: INK, fontFamily: 'Helvetica' },
    light: { backgroundColor: CARD, fontFamily: 'Helvetica' },
    white: { backgroundColor: '#FFFFFF', fontFamily: 'Helvetica' },
    kicker: { fontSize: 9, color: TEAL, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
    h1: { fontSize: 21, color: INK, fontFamily: 'Helvetica-Bold', marginTop: 4 },
    footer: { position: 'absolute', bottom: 14, left: 30, fontSize: 6.5, color: '#9AA7AB' },
    pageNo: { position: 'absolute', bottom: 14, right: 30, fontSize: 6.5, color: '#9AA7AB' },
    logoChip: { position: 'absolute', top: 20, right: 30, backgroundColor: '#FFFFFF', borderRadius: 4, padding: 6, width: 86, alignItems: 'center' },
    card: { backgroundColor: '#FFFFFF', borderRadius: 5, borderWidth: 1, borderColor: LINE },
    qtyPill: { position: 'absolute', top: 6, right: 6, backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7 },
    qtyText: { fontSize: 7, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
    cardName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK },
    cardDesc: { fontSize: 7, color: MUTED, marginTop: 2, lineHeight: 1.35 },
});

function Footer({ n }) {
    return (
        <>
            <Text style={s.footer} fixed>PICO International (Bahrain) W.L.L.  ·  CONFIDENTIAL</Text>
            {n ? <Text style={s.pageNo} fixed>{String(n)}</Text> : null}
        </>
    );
}
function LogoChip({ img }) {
    if (!img.logo) return null;
    return <View style={s.logoChip}><Image src={img.logo} style={{ width: 70 }} /></View>;
}
function TitleBar({ kicker, title }) {
    return (
        <View style={{ paddingTop: 22, paddingHorizontal: 30 }}>
            <Text style={s.kicker}>{kicker.toUpperCase()}</Text>
            <Text style={s.h1}>{title}</Text>
        </View>
    );
}
function Contain({ img, name, x, y, w, h }) {
    const src = img[name];
    if (!src) return null;
    const nat = img.__sizes && img.__sizes[name];
    let bw = w, bh = h, bx = x, by = y;
    if (nat && nat[0] && nat[1]) {
        const r = Math.min(w / nat[0], h / nat[1]);
        bw = nat[0] * r; bh = nat[1] * r;
        bx = x + (w - bw) / 2; by = y + (h - bh) / 2;
    }
    return <Image src={src} style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh }} />;
}
function ItemCard({ it, img, x, y, w, h }) {
    const imgH = h * 0.5;
    return (
        <View style={[s.card, { position: 'absolute', left: x, top: y, width: w, height: h }]} wrap={false}>
            {it.img && img[it.img] ? <Contain img={img} name={it.img} x={8} y={8} w={w - 16} h={imgH} /> : null}
            <View style={s.qtyPill}><Text style={s.qtyText}>QTY {it.qty}{it.unit ? ' ' + it.unit.toUpperCase() : ''}</Text></View>
            <View style={{ position: 'absolute', left: 8, top: imgH + 14, width: w - 16 }}>
                <Text style={s.cardName}>{it.no}. {it.name}</Text>
                <Text style={s.cardDesc}>{it.desc}</Text>
            </View>
        </View>
    );
}
function Divider({ num, title, sub, img, n }) {
    return (
        <Page size="A4" orientation="landscape" style={s.dark}>
            <Text style={{ position: 'absolute', top: 150, left: 36, fontSize: 64, color: TEAL, fontFamily: 'Helvetica-Bold' }}>{num}</Text>
            <Text style={{ position: 'absolute', top: 250, left: 38, fontSize: 30, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{title}</Text>
            <Text style={{ position: 'absolute', top: 296, left: 38, width: 640, fontSize: 11, color: '#B9C6C9' }}>{sub}</Text>
            <LogoChip img={img} />
            <Footer n={n} />
        </Page>
    );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function eventDays(duration) { const m = String(duration || '').match(/\d+/); return m ? m[0] : (duration || '—'); }

// Render a card-grid section across pages (max 8 cards / page).
function sectionPages(sec, items, img, pageNoRef) {
    const pages = [];
    const per = 8;
    const chunks = [];
    for (let i = 0; i < items.length; i += per) chunks.push(items.slice(i, i + per));
    chunks.forEach((chunk, ci) => {
        const cols = Math.min(4, chunk.length);
        const rows = Math.ceil(chunk.length / cols);
        const gw = (PW - 60 - (cols - 1) * 10) / cols;
        const gh = rows === 1 ? PH - 150 : (PH - 158) / 2;
        pages.push(
            <Page key={`${sec.title}-${ci}`} size="A4" orientation="landscape" style={s.light}>
                <TitleBar kicker={sec.kicker} title={sec.title + (chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : '')} />
                <LogoChip img={img} />
                {chunk.map((it, i) => {
                    const col = i % cols, row = Math.floor(i / cols);
                    return <ItemCard key={it.no} it={it} img={img} x={30 + col * (gw + 10)} y={92 + row * (gh + 8)} w={gw} h={gh} />;
                })}
                <Footer n={pageNoRef()} />
            </Page>
        );
    });
    return pages;
}

export async function renderPresentationPdf({ ministry, quote, lines, img }) {
    const byNo = new Map();
    for (const l of lines) byNo.set(l.itemNo, l);
    const has = (no) => byNo.has(no);
    const heads = clamp(parseInt(quote.heads, 10) || 10, 7, 10);
    const heroName = 'pax' + heads;
    const cfg = heads === 7 ? [7, 8] : [heads - 1, heads];

    const item = (no) => {
        const l = byNo.get(no);
        if (!l) return null;
        const c = CATALOG_BY_NO.get(no) || {};
        return {
            no, qty: l.qty, unit: c.unit || '', name: l.nameSnapshot || c.name || `Item ${no}`,
            desc: (c.description || '').slice(0, 165), img: `item${no}`,
        };
    };
    const totalItems = lines.length;
    const ledQty = byNo.get(LED_NO)?.qty;
    const days = eventDays(quote.duration);

    let page = 0;
    const nextNo = () => ++page;

    // Pre-build dynamic slide groups.
    const backdropItems = BACKDROP_NOS.map(item).filter(Boolean);
    const soundItems = SOUND_NOS.map(item).filter(Boolean);
    const confItems = CONFERENCE_NOS.map(item).filter(Boolean);
    const furnitureSecs = CARD_SECTIONS.slice(0, 4);   // Seating, Tables, Flags, Table Accessories
    const tailSecs = CARD_SECTIONS.slice(4);           // Stationery, IT
    const present = (sec) => ({ ...sec, items: sec.nos.map(item).filter(Boolean) });

    const doc = (
        <Document title={`Technical Proposal — ${ministry.name}`} author="PICO International (Bahrain) W.L.L.">
            {/* COVER */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                {img.cover ? <Image src={img.cover} style={{ position: 'absolute', left: PW * 0.53, top: 0, width: PW * 0.47, height: PH, objectFit: 'cover' }} /> : null}
                <View style={{ position: 'absolute', left: PW * 0.51, top: 0, width: 14, height: PH, backgroundColor: INK }} />
                <View style={{ position: 'absolute', top: 34, left: 36, backgroundColor: '#FFFFFF', borderRadius: 4, padding: 8, width: 104, alignItems: 'center' }}>
                    {img.logo ? <Image src={img.logo} style={{ width: 84 }} /> : null}
                </View>
                <Text style={{ position: 'absolute', top: 120, left: 38, fontSize: 9, color: MINT, fontFamily: 'Helvetica-Bold', letterSpacing: 3 }}>CONFIDENTIAL</Text>
                <Text style={{ position: 'absolute', top: 160, left: 36, width: PW * 0.46, fontSize: 34, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>Technical Proposal</Text>
                <Text style={{ position: 'absolute', top: 212, left: 38, width: PW * 0.45, fontSize: 14, color: '#D8E2E4' }}>{quote.eventName || `${ministry.name} — Ministers Meeting`}</Text>
                <View style={{ position: 'absolute', top: 280, left: 38 }}>
                    {[['VENUE', quote.venue || '—'], ['DATE', quote.eventDate || '—'], ['DURATION', quote.duration || '—'], ['REF', `${quote.ref}${quote.revision > 1 ? ` · Rev ${quote.revision}` : ''}`]].map(([k, v]) => (
                        <View key={k} style={{ flexDirection: 'row', marginBottom: 7 }}>
                            <Text style={{ width: 70, fontSize: 9.5, color: MINT, fontFamily: 'Helvetica-Bold' }}>{k}</Text>
                            <Text style={{ fontSize: 9.5, color: '#D8E2E4', width: PW * 0.38 }}>{v}</Text>
                        </View>
                    ))}
                </View>
                {/* A ministry sometimes runs several meetings on one identical
                    scope; listing them here keeps it to a single proposal. */}
                {(quote.meetings || []).length ? (
                    <View style={{ position: 'absolute', top: 372, left: 38, width: PW * 0.45 }}>
                        <Text style={{ fontSize: 9.5, color: MINT, fontFamily: 'Helvetica-Bold', marginBottom: 5 }}>MEETINGS COVERED</Text>
                        {quote.meetings.map((m) => (
                            <View key={m.ref || m.title} style={{ flexDirection: 'row', marginBottom: 3 }}>
                                <Text style={{ width: PW * 0.26, fontSize: 8.5, color: '#FFFFFF' }}>{m.title}</Text>
                                <Text style={{ flex: 1, fontSize: 8.5, color: '#9AA7AB' }}>{m.date}{m.ref ? `  ·  ${m.ref}` : ''}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}
                <Text style={{ position: 'absolute', bottom: 30, left: 38, fontSize: 8, color: '#9AA7AB', fontFamily: 'Helvetica-Oblique' }}>Events and Conference Planning, Management and Production</Text>
                {nextNo() ? null : null}
            </Page>

            {/* OVERVIEW */}
            <Page size="A4" orientation="landscape" style={s.light}>
                <TitleBar kicker="Event Overview" title="Scope of Works at a Glance" />
                <LogoChip img={img} />
                <View style={{ flexDirection: 'row', marginTop: 16, paddingHorizontal: 30 }}>
                    {[[String(totalItems), 'Scope items covered in this proposal'], [String(heads), 'Ministries seated at the Head Table'], [ledQty != null ? String(ledQty) : '—', 'LED screens · P2.9 4m × 2.5m each'], [String(days), 'Event days, full technical crew on site']].map(([big, small], i) => (
                        <View key={i} style={[s.card, { width: (PW - 60 - 30) / 4, marginRight: i < 3 ? 10 : 0, height: 84, padding: 10 }]}>
                            <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: TEAL }}>{big}</Text>
                            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4 }}>{small}</Text>
                        </View>
                    ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, paddingHorizontal: 30 }}>
                    {OVERVIEW_CATEGORIES.map((c, i) => (
                        <View key={c[0]} style={[s.card, { width: (PW - 60 - 20) / 3, marginRight: (i % 3) < 2 ? 10 : 0, marginBottom: 10, height: 74, flexDirection: 'row', padding: 10 }]}>
                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                <Text style={{ fontSize: 9, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>{c[0]}</Text>
                                <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>{c[1]}</Text>
                            </View>
                        </View>
                    ))}
                </View>
                <Footer n={nextNo()} />
            </Page>

            {/* 01 DESIGN */}
            <Divider num="01" title="Design Proposal" sub={`General layout, head table and backdrop for the Ministers Meeting${quote.venue ? ` — ${quote.venue}` : ''}`} img={img} n={nextNo()} />

            {/* GENERAL LAYOUT — TOP VIEW (front-view slide intentionally removed) */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                {img.topview ? <Image src={img.topview} style={{ position: 'absolute', left: 0, top: 0, width: PW, height: PH, objectFit: 'cover' }} /> : null}
                <View style={{ position: 'absolute', bottom: 28, left: 30, backgroundColor: INK, opacity: 0.92, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 14 }}>
                    <Text style={{ fontSize: 11, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', letterSpacing: 2 }}>GENERAL LAYOUT — TOP VIEW</Text>
                </View>
                {nextNo() ? null : null}
            </Page>

            {/* VENUE LAYOUT — STRUCTURE PLAN (CAD) */}
            <Page size="A4" orientation="landscape" style={s.white}>
                <TitleBar kicker="Design Proposal" title="Venue Layout — Structure Plan" />
                <LogoChip img={img} />
                <Contain img={img} name="structure" x={30} y={86} w={PW - 60} h={PH - 120} />
                <Footer n={nextNo()} />
            </Page>

            {/* BACKDROP & PLATFORM */}
            {backdropItems.length ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Design Proposal" title="Main Backdrop & Group-Photo Platform" />
                    <LogoChip img={img} />
                    <Contain img={img} name="backdrop" x={30} y={95} w={PW * 0.55} h={PH - 140} />
                    {backdropItems.slice(0, 4).map((it, i) => {
                        const n = Math.min(backdropItems.length, 4);
                        const areaTop = 95, areaH = PH - 140;
                        const ch = (areaH - (n - 1) * 8) / n;
                        const y = areaTop + i * (ch + 8);
                        return (
                            <View key={it.no} style={[s.card, { position: 'absolute', left: PW * 0.58 + 20, top: y, width: PW * 0.42 - 60, height: ch, padding: 8 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ width: 17, height: 17, borderRadius: 8.5, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                                        <Text style={{ fontSize: 8.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{it.no}</Text>
                                    </View>
                                    <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{it.name}</Text>
                                    <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEAL, marginLeft: 6 }}>{it.qty} {it.unit}</Text>
                                </View>
                                <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4, lineHeight: 1.35 }}>{it.desc}</Text>
                            </View>
                        );
                    })}
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* HEAD TABLE HERO */}
            {has(HEAD_TABLE_NO) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Design Proposal · Item 6" title={`Head Table — ${heads}-Ministry Configuration`} />
                    <LogoChip img={img} />
                    <View style={{ position: 'absolute', left: 30, top: 95, width: PW * 0.58, height: PH - 140, backgroundColor: '#1F2528', borderRadius: 4 }} />
                    <Contain img={img} name={heroName} x={30} y={95} w={PW * 0.58} h={PH - 140} />
                    <View style={[s.card, { position: 'absolute', left: PW * 0.62 + 8, top: 95, width: PW * 0.38 - 68, height: PH - 140, padding: 12 }]}>
                        <View style={{ backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 7.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>QTY {byNo.get(HEAD_TABLE_NO).qty} SET</Text>
                        </View>
                        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8 }}>Custom-built round modular table</Text>
                        {['Seats 10 ministries, adjustable 7–10 pax with custom filler pieces', 'MDF structure in wood veneer finish', 'CNC / inlay decorative elements on table top', 'Provision for cable management & display screen mounting', 'Overall size: 6,680mm dia × H780mm (10-pax setup)'].map((t, i) => (
                            <View key={i} style={{ flexDirection: 'row', marginTop: 7 }}>
                                <Text style={{ fontSize: 8, color: TEAL, marginRight: 5 }}>•</Text>
                                <Text style={{ fontSize: 8.5, color: MUTED, flex: 1, lineHeight: 1.4 }}>{t}</Text>
                            </View>
                        ))}
                    </View>
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* CONFIGURATIONS (two) */}
            {has(HEAD_TABLE_NO) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Design Proposal · Item 6" title={`Head Table Configurations ( ${cfg[0]} – ${cfg[1]} Pax )`} />
                    <LogoChip img={img} />
                    {cfg.map((n, i) => {
                        const w = (PW - 70) / 2, h = PH - 150;
                        const x = 30 + i * (w + 10), y = 100;
                        return (
                            <View key={n}>
                                <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, backgroundColor: '#1F2528', borderRadius: 4 }} />
                                <Contain img={img} name={'pax' + n} x={x} y={y} w={w} h={h} />
                                <View style={{ position: 'absolute', left: x + 10, top: y + h - 24, backgroundColor: TEAL, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 10 }}>
                                    <Text style={{ fontSize: 8.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{n} PAX</Text>
                                </View>
                            </View>
                        );
                    })}
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* 02 FURNITURE & RENTAL */}
            <Divider num="02" title="Furniture & Rental Items" sub="Seating, tables, flags and table accessories — rental supply from standard inventory and custom builds" img={img} n={nextNo()} />
            {furnitureSecs.map(present).filter((sec) => sec.items.length).flatMap((sec) => sectionPages(sec, sec.items, img, nextNo))}

            {/* 03 AUDIO VISUAL */}
            <Divider num="03" title="Audio Visual & Technology" sub="LED screens, sound reinforcement, conference system and synchronized display monitors" img={img} n={nextNo()} />

            {/* LED SCREENS (dedicated) */}
            {has(LED_NO) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Audio Visual · Item 15" title={`LED Screens${ledQty != null ? ` — ${ledQty} Sets` : ''}`} />
                    <LogoChip img={img} />
                    <Contain img={img} name="led" x={30} y={95} w={PW * 0.56} h={PH - 140} />
                    <View style={[s.card, { position: 'absolute', left: PW * 0.6 + 8, top: 95, width: PW * 0.4 - 68, height: PH - 140, padding: 12 }]}>
                        <View style={{ backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 7.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>QTY {byNo.get(LED_NO).qty}{byNo.get(LED_NO).qty ? ' SETS' : ''}</Text>
                        </View>
                        <Text style={{ fontSize: 12.5, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8 }}>P2.9 LED Display — 4m × H2.5m each</Text>
                        {['Indoor/outdoor pixel pitch 2.9 LED display', 'LED type: Black SMD 3-in-1 2121 · 1000 nit brightness', 'NOVASTAR J6 LED processor & Lightware matrix', 'Power & data cables, mounting accessories', 'Custom wooden cladding for screen base, sides & top frame', 'Transport, delivery, installation & dismantling labour', 'LED technician for installation, programming & show operation'].map((t, i) => (
                            <View key={i} style={{ flexDirection: 'row', marginTop: 6 }}>
                                <Text style={{ fontSize: 8, color: TEAL, marginRight: 5 }}>•</Text>
                                <Text style={{ fontSize: 8, color: MUTED, flex: 1, lineHeight: 1.35 }}>{t}</Text>
                            </View>
                        ))}
                    </View>
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* SOUND SYSTEM (cards + mixer) */}
            {soundItems.length ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Audio Visual" title="Sound System" />
                    <LogoChip img={img} />
                    {soundItems.slice(0, 2).map((it, i) => {
                        const w = 3.7 / 13.333 * PW, gh = PH - 150;
                        const x = 30 + i * (w + 12);
                        return <ItemCard key={it.no} it={it} img={img} x={x} y={92} w={w} h={gh} />;
                    })}
                    <View style={[s.card, { position: 'absolute', left: 30 + 2 * (3.7 / 13.333 * PW + 12), top: 92, width: 3.7 / 13.333 * PW, height: PH - 150 }]}>
                        <Contain img={img} name="mixer" x={8} y={8} w={3.7 / 13.333 * PW - 16} h={(PH - 150) * 0.5} />
                        <View style={{ position: 'absolute', left: 8, top: (PH - 150) * 0.5 + 14, width: 3.7 / 13.333 * PW - 16 }}>
                            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>Supporting FOH Control</Text>
                            <Text style={{ fontSize: 8, color: MUTED, marginTop: 3, lineHeight: 1.4 }}>Digital mixing console with remote control, operated by PICO audio engineers throughout the event — included within the audio system scope.</Text>
                        </View>
                    </View>
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* CONFERENCE COMMUNICATION SYSTEM */}
            {confItems.length ? sectionPages({ kicker: 'Audio Visual', title: 'Conference Communication System' }, confItems, img, nextNo) : null}

            {/* STATIONERY + IT */}
            {tailSecs.map(present).filter((sec) => sec.items.length).flatMap((sec) => sectionPages(sec, sec.items, img, nextNo))}

            {/* SERVICES — EVENT MANAGEMENT STAFF */}
            {has(SERVICES_NO) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Services · Item 38" title="Event Management Staff" />
                    <LogoChip img={img} />
                    <View style={[s.card, { position: 'absolute', left: 30, top: 100, width: PW * 0.56, height: PH - 150, padding: 16 }]}>
                        <View style={{ backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 7.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>QTY {byNo.get(SERVICES_NO).qty}</Text>
                        </View>
                        <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 8 }}>Dedicated project team, end to end</Text>
                        {['Event Project Manager — single point of contact from award to handover', 'Project & Production Coordinators (4–5 pax) across build-up, event days and dismantling', 'Technical personnel included within the respective AV sections (LED, sound, conference system)', `Coordination with venue${quote.venue ? ` (${quote.venue})` : ''} and ministry protocol teams`].map((t, i) => (
                            <View key={i} style={{ flexDirection: 'row', marginTop: 9 }}>
                                <Text style={{ fontSize: 9, color: TEAL, marginRight: 6 }}>•</Text>
                                <Text style={{ fontSize: 10, color: MUTED, flex: 1, lineHeight: 1.4 }}>{t}</Text>
                            </View>
                        ))}
                    </View>
                    <View style={{ position: 'absolute', left: PW * 0.6 + 8, top: 100, width: PW * 0.4 - 68, height: PH - 150, backgroundColor: INK, borderRadius: 5, padding: 16 }}>
                        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 4, padding: 6, width: 84, alignItems: 'center' }}>
                            {img.logo ? <Image src={img.logo} style={{ width: 68 }} /> : null}
                        </View>
                        <Text style={{ fontSize: 9, color: MINT, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, marginTop: 16 }}>YOUR PICO CONTACT</Text>
                        <Text style={{ fontSize: 15, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', marginTop: 6 }}>Ebrahim Mohammed</Text>
                        <Text style={{ fontSize: 10, color: '#B9C6C9', marginTop: 3 }}>Project Executive</Text>
                        <View style={{ marginTop: 14 }}>
                            {[['M', '+973 3635 7377'], ['E', 'Ebrahim@picobahrain.com'], ['T', '+973 7707 7777']].map(([k, v]) => (
                                <View key={k} style={{ flexDirection: 'row', marginBottom: 5 }}>
                                    <Text style={{ width: 16, fontSize: 9.5, color: MINT, fontFamily: 'Helvetica-Bold' }}>{k}</Text>
                                    <Text style={{ fontSize: 9.5, color: '#D8E2E4' }}>{v}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* THANK YOU */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                <Text style={{ position: 'absolute', top: 200, left: 38, fontSize: 40, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>Thank You.</Text>
                <Text style={{ position: 'absolute', top: 265, left: 38, fontSize: 11, color: '#B9C6C9', fontFamily: 'Helvetica-Oblique' }}>{"Where there's an audience, there's a mission for Total Brand Activation."}</Text>
                <Text style={{ position: 'absolute', top: 300, left: 38, fontSize: 10, color: '#D8E2E4' }}>
                    Ebrahim Mohammed — Project Executive   ·   <Text style={{ color: MINT }}>+973 3635 7377   ·   Ebrahim@picobahrain.com</Text>
                </Text>
                <LogoChip img={img} />
                <Text style={{ position: 'absolute', bottom: 26, left: 38, fontSize: 7, color: '#9AA7AB' }}>CONFIDENTIAL — prepared exclusively for {ministry.name}, Kingdom of Bahrain</Text>
            </Page>
        </Document>
    );

    return renderToBuffer(doc);
}
