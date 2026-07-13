import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { CATALOG } from '@/lib/ministry/catalog';
import { SECTIONS } from '@/lib/ministry/presentationAssets';

// Auto-generated "Technical Proposal" presentation (landscape deck-style PDF),
// built from a ministry's latest quotation. Admin-only. Mirrors the manual
// MOFNE/MoH proposal decks: cover, design section, per-category item cards.

const INK = '#22282B';
const TEAL = '#00857A';
const MINT = '#00C7B1';
const MUTED = '#6B7A80';
const CARD = '#F5F8F8';
const LINE = '#E3EAEA';

const CATALOG_BY_NO = new Map(CATALOG.map((c) => [c.itemNo, c]));

const s = StyleSheet.create({
    dark: { backgroundColor: INK, padding: 0, fontFamily: 'Helvetica' },
    light: { backgroundColor: CARD, padding: 0, fontFamily: 'Helvetica' },
    kicker: { fontSize: 9, color: TEAL, fontFamily: 'Helvetica-Bold', letterSpacing: 2, textTransform: 'uppercase' },
    h1: { fontSize: 22, color: INK, fontFamily: 'Helvetica-Bold', marginTop: 4 },
    footer: { position: 'absolute', bottom: 14, left: 30, fontSize: 6.5, color: '#9AA7AB' },
    pageNo: { position: 'absolute', bottom: 14, right: 30, fontSize: 6.5, color: '#9AA7AB' },
    logoChip: { position: 'absolute', top: 20, right: 30, backgroundColor: '#FFFFFF', borderRadius: 4, padding: 6, width: 86, alignItems: 'center' },
    card: { backgroundColor: '#FFFFFF', borderRadius: 5, borderWidth: 1, borderColor: LINE, padding: 8 },
    qtyPill: { position: 'absolute', top: 6, right: 6, backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 7 },
    qtyText: { fontSize: 7, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' },
    cardName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 5 },
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
    return (
        <View style={s.logoChip}><Image src={img.logo} style={{ width: 70 }} /></View>
    );
}
function TitleBar({ kicker, title, img }) {
    return (
        <View style={{ paddingTop: 22, paddingHorizontal: 30 }}>
            <Text style={s.kicker}>{kicker}</Text>
            <Text style={s.h1}>{title}</Text>
        </View>
    );
}
// Aspect-correct contain box for an image with known natural size.
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
    const imgH = h * 0.52;
    return (
        <View style={[s.card, { position: 'absolute', left: x, top: y, width: w, height: h }]} wrap={false}>
            {it.img && img[it.img] ? <Contain img={img} name={it.img} x={8} y={8} w={w - 32} h={imgH} /> : null}
            <View style={s.qtyPill}><Text style={s.qtyText}>QTY {it.qty}{it.unit ? ' ' + it.unit.toUpperCase() : ''}</Text></View>
            <View style={{ position: 'absolute', left: 8, top: imgH + 14, width: w - 16 }}>
                <Text style={s.cardName}>{it.no}. {it.name}</Text>
                <Text style={s.cardDesc}>{it.desc}</Text>
            </View>
        </View>
    );
}

const PW = 842, PH = 595; // A4 landscape (pt)

export async function renderPresentationPdf({ ministry, quote, lines, img }) {
    // lines -> presentation items keyed by catalog item_no
    const byNo = new Map();
    for (const l of lines) byNo.set(l.itemNo, l);
    const heads = ['7', '8', '9', '10'].includes(String(quote.heads)) ? String(quote.heads) : '10';
    const heroName = 'pax' + heads;

    const item = (no) => {
        const l = byNo.get(no);
        if (!l) return null;
        const c = CATALOG_BY_NO.get(no) || {};
        return {
            no, qty: l.qty, unit: c.unit || '', name: l.nameSnapshot || c.name || `Item ${no}`,
            desc: (c.description || '').slice(0, 170), img: `item${no}`,
        };
    };
    const sections = SECTIONS.map((sec) => ({ ...sec, items: sec.nos.map(item).filter(Boolean) })).filter((sec) => sec.items.length > 0);
    const totalItems = lines.length;

    let page = 0;
    const nextNo = () => ++page;

    const doc = (
        <Document title={`Technical Proposal — ${ministry.name}`} author="PICO International (Bahrain) W.L.L.">
            {/* ---------- COVER ---------- */}
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
                <Text style={{ position: 'absolute', bottom: 30, left: 38, fontSize: 8, color: '#9AA7AB', fontFamily: 'Helvetica-Oblique' }}>Events and Conference Planning, Management and Production</Text>
                {nextNo() ? null : null}
            </Page>

            {/* ---------- OVERVIEW ---------- */}
            <Page size="A4" orientation="landscape" style={s.light}>
                <TitleBar kicker="Event Overview" title="Scope of Works at a Glance" />
                <LogoChip img={img} />
                <View style={{ flexDirection: 'row', marginTop: 16, paddingHorizontal: 30 }}>
                    {[[String(totalItems), 'Scope items covered in this proposal'], [heads, 'Ministries seated at the Head Table'], [quote.duration || '—', 'Event duration'], [quote.venue || '—', 'Venue']].map(([big, small], i) => (
                        <View key={i} style={[s.card, { width: (PW - 60 - 30) / 4, marginRight: i < 3 ? 10 : 0, height: 84 }]}>
                            <Text style={{ fontSize: big.length > 6 ? 13 : 26, fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: big.length > 6 ? 8 : 0 }}>{big}</Text>
                            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4 }}>{small}</Text>
                        </View>
                    ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, paddingHorizontal: 30 }}>
                    {sections.map((sec, i) => (
                        <View key={sec.key} style={[s.card, { width: (PW - 60 - 20) / 3, marginRight: (i % 3) < 2 ? 10 : 0, marginBottom: 10, height: 74, flexDirection: 'row' }]}>
                            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                <Text style={{ fontSize: 9, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{i + 1}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK }}>{sec.title}</Text>
                                <Text style={{ fontSize: 7, color: MUTED, marginTop: 2 }}>{sec.items.map((it) => it.name).join(' · ').slice(0, 130)}</Text>
                            </View>
                        </View>
                    ))}
                </View>
                <Footer n={nextNo()} />
            </Page>

            {/* ---------- DIVIDER: DESIGN ---------- */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                <Text style={{ position: 'absolute', top: 150, left: 36, fontSize: 64, color: TEAL, fontFamily: 'Helvetica-Bold' }}>01</Text>
                <Text style={{ position: 'absolute', top: 250, left: 38, fontSize: 30, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>Design Proposal</Text>
                <Text style={{ position: 'absolute', top: 295, left: 38, width: 600, fontSize: 11, color: '#B9C6C9' }}>General layout, structure plan, head table and backdrop{quote.venue ? ` — ${quote.venue}` : ''}</Text>
                <LogoChip img={img} />
                <Footer n={nextNo()} />
            </Page>

            {/* ---------- GENERAL LAYOUT ---------- */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                {img.layout ? <Image src={img.layout} style={{ position: 'absolute', left: 0, top: 0, width: PW, height: PH, objectFit: 'cover' }} /> : null}
                <View style={{ position: 'absolute', bottom: 28, left: 30, backgroundColor: INK, opacity: 0.92, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 14 }}>
                    <Text style={{ fontSize: 11, color: '#FFFFFF', fontFamily: 'Helvetica-Bold', letterSpacing: 2 }}>GENERAL LAYOUT</Text>
                </View>
                {nextNo() ? null : null}
            </Page>

            {/* ---------- STRUCTURE PLAN ---------- */}
            <Page size="A4" orientation="landscape" style={{ backgroundColor: '#FFFFFF', fontFamily: 'Helvetica' }}>
                <TitleBar kicker="Design Proposal" title="General Layout — Structure Plan" />
                <LogoChip img={img} />
                <Text style={{ paddingHorizontal: 30, marginTop: 3, fontSize: 7.5, color: MUTED, fontFamily: 'Helvetica-Oblique' }}>Schematic, not to construction scale — item numbers refer to the quotation scope of works.</Text>
                <Contain img={img} name="structure" x={40} y={92} w={PW - 80} h={PH - 130} />
                <Footer n={nextNo()} />
            </Page>

            {/* ---------- BACKDROP & PLATFORM ---------- */}
            <Page size="A4" orientation="landscape" style={s.light}>
                <TitleBar kicker="Design Proposal" title="Main Backdrop & Group-Photo Platform" />
                <LogoChip img={img} />
                <Contain img={img} name="backdrop" x={30} y={95} w={PW * 0.55} h={PH - 140} />
                {[1, 2, 3].map((no, i) => {
                    const it = item(no);
                    if (!it) return null;
                    const y = 100 + i * 105;
                    return (
                        <View key={no} style={[s.card, { position: 'absolute', left: PW * 0.58 + 20, top: y, width: PW * 0.42 - 60, height: 95 }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: TEAL, alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                                    <Text style={{ fontSize: 9, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{no}</Text>
                                </View>
                                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK }}>{it.name}</Text>
                                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEAL, marginLeft: 6 }}>{it.qty} {it.unit}</Text>
                            </View>
                            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 4, lineHeight: 1.4 }}>{it.desc}</Text>
                        </View>
                    );
                })}
                <Footer n={nextNo()} />
            </Page>

            {/* ---------- HEAD TABLE HERO ---------- */}
            {byNo.has(6) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Design Proposal · Item 6" title={`Head Table — ${heads}-Ministry Configuration`} />
                    <LogoChip img={img} />
                    <View style={{ position: 'absolute', left: 30, top: 95, width: PW * 0.58, height: PH - 140, backgroundColor: '#1F2528', borderRadius: 4 }} />
                    <Contain img={img} name={heroName} x={30} y={95} w={PW * 0.58} h={PH - 140} />
                    <View style={[s.card, { position: 'absolute', left: PW * 0.62 + 8, top: 95, width: PW * 0.38 - 68, height: PH - 140 }]}>
                        <View style={{ backgroundColor: TEAL, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontSize: 7.5, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>QTY {byNo.get(6).qty} SET</Text>
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

            {/* ---------- CONFIGURATIONS ---------- */}
            {byNo.has(6) ? (
                <Page size="A4" orientation="landscape" style={s.light}>
                    <TitleBar kicker="Design Proposal · Item 6" title="Head Table Configurations (7 – 10 Pax)" />
                    <LogoChip img={img} />
                    {[['pax7', '7 PAX'], ['pax8', '8 PAX'], ['pax9', '9 PAX'], ['pax10', '10 PAX']].map(([nm, label], i) => {
                        const col = i % 2, row = Math.floor(i / 2);
                        const x = 30 + col * ((PW - 70) / 2 + 10), y = 92 + row * ((PH - 140) / 2 + 8);
                        const w = (PW - 70) / 2, h = (PH - 148) / 2;
                        return (
                            <View key={nm}>
                                <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, backgroundColor: '#1F2528', borderRadius: 4 }} />
                                <Contain img={img} name={nm} x={x} y={y} w={w} h={h} />
                                <View style={{ position: 'absolute', left: x + 8, top: y + h - 22, backgroundColor: TEAL, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 9 }}>
                                    <Text style={{ fontSize: 8, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>{label}</Text>
                                </View>
                            </View>
                        );
                    })}
                    <Footer n={nextNo()} />
                </Page>
            ) : null}

            {/* ---------- DIVIDER: SCOPE ---------- */}
            <Page size="A4" orientation="landscape" style={s.dark}>
                <Text style={{ position: 'absolute', top: 150, left: 36, fontSize: 64, color: TEAL, fontFamily: 'Helvetica-Bold' }}>02</Text>
                <Text style={{ position: 'absolute', top: 250, left: 38, fontSize: 30, color: '#FFFFFF', fontFamily: 'Helvetica-Bold' }}>Scope of Works — Item by Item</Text>
                <Text style={{ position: 'absolute', top: 295, left: 38, width: 620, fontSize: 11, color: '#B9C6C9' }}>Every item from quotation {quote.ref}, with reference photos and quantities as requested.</Text>
                <LogoChip img={img} />
                <Footer n={nextNo()} />
            </Page>

            {/* ---------- SECTION ITEM CARDS ---------- */}
            {sections.map((sec) => {
                const perPage = 6;
                const pages = [];
                for (let i = 0; i < sec.items.length; i += perPage) pages.push(sec.items.slice(i, i + perPage));
                return pages.map((items, pi) => (
                    <Page key={`${sec.key}-${pi}`} size="A4" orientation="landscape" style={s.light}>
                        <TitleBar kicker="Scope of Works" title={sec.title + (pages.length > 1 ? ` (${pi + 1}/${pages.length})` : '')} />
                        <LogoChip img={img} />
                        {items.map((it, i) => {
                            const cols = Math.min(3, items.length);
                            const rows = items.length > 3 ? 2 : 1;
                            const col = i % 3, row = Math.floor(i / 3);
                            const gw = (PW - 60 - (cols - 1) * 10) / cols;
                            const gh = rows === 1 ? PH - 150 : (PH - 158) / 2;
                            return <ItemCard key={it.no} it={it} img={img} x={30 + col * (gw + 10)} y={92 + row * (gh + 8)} w={gw} h={gh} />;
                        })}
                        <Footer n={nextNo()} />
                    </Page>
                ));
            })}

            {/* ---------- THANK YOU ---------- */}
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
