import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY } from '@/lib/ministry/company';
import { PICO_LOGO_DATA_URI } from '@/lib/ministry/logos';
import { SINGLE_STOCK_ITEM_NOS, TITLE_ITEM_NOS, pickListFor, PICK_LIST_EN, selectionFit } from '@/lib/ministry/production';
import { isCustomItemNo } from '@/lib/ministry/quotationScan';

// A printable copy of the shared production sheet, so a crew can carry the
// list without the link. Same content, same order, no rates — this document
// says what to deliver, never what it costs.

const AR = 'NotoArabic';
const INK = '#22282B';
const TEAL = '#00857A';
const MUTED = '#75787B';
const LINE = '#e2e8f0';

const s = StyleSheet.create({
    // paddingTop clears the fixed header, which repeats on every page — measured
    // against the rendered PDF, not guessed, or the first row prints over the rule
    page: { paddingTop: 114, paddingBottom: 38, paddingHorizontal: 30, fontSize: 9, color: INK, fontFamily: 'Helvetica' },
    header: { position: 'absolute', top: 22, left: 30, right: 30 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logo: { width: 104 },
    badge: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#fff', backgroundColor: TEAL, paddingVertical: 2, paddingHorizontal: 6 },
    title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 6 },
    event: { fontSize: 9, color: '#4D4D4F', marginTop: 2 },
    rule: { borderBottomWidth: 1.5, borderBottomColor: '#00C7B1', marginTop: 6 },
    metaBox: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 0.7, borderColor: LINE, padding: 6, marginBottom: 8 },
    metaCell: { width: '50%', paddingVertical: 1.5, paddingRight: 6, fontSize: 8.5 },
    metaLabel: { fontFamily: 'Helvetica-Bold', color: TEAL },
    note: { borderWidth: 0.7, borderColor: '#fed7aa', backgroundColor: '#fff7ed', color: '#9a3412', padding: 6, fontSize: 8.5, marginBottom: 8 },
    th: { flexDirection: 'row', backgroundColor: INK, paddingVertical: 4 },
    thCell: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: '#fff', paddingHorizontal: 4 },
    row: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: '#f1f5f9', paddingVertical: 4, alignItems: 'flex-start' },
    cNo: { width: '7%' }, cImg: { width: '13%' }, cName: { width: '68%' }, cQty: { width: '12%' },
    cell: { paddingHorizontal: 4, fontSize: 8.5 },
    thumb: { width: 46, height: 32, objectFit: 'contain' },
    tag: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#475569', backgroundColor: '#f1f5f9', paddingHorizontal: 3, paddingVertical: 1 },
    tagAdd: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: '#9a3412', backgroundColor: '#fff7ed', paddingHorizontal: 3, paddingVertical: 1 },
    tagRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
    titleBox: { marginTop: 3, borderWidth: 0.6, borderColor: '#99f6e4', backgroundColor: '#f0fdfa', color: TEAL, padding: 3, fontSize: 8 },
    arabic: { fontFamily: AR, fontSize: 9, textAlign: 'right', direction: 'rtl' },
    pick: { fontSize: 8, marginTop: 1.5, paddingLeft: 8 },
    pickEn: { fontSize: 7, color: '#94a3b8' },
    per: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: TEAL, marginTop: 2 },
    footer: { position: 'absolute', bottom: 16, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: MUTED },
});

function Header({ data }) {
    return (
        <View style={s.header} fixed>
            <View style={s.topRow}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.logo} src={PICO_LOGO_DATA_URI} />
                <Text style={s.badge}>PRODUCTION SHEET</Text>
            </View>
            <Text style={s.title}>{data.ministryName}</Text>
            {data.eventName ? <Text style={s.event}>{data.eventName}</Text> : null}
            <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 2 }}>Reference {data.ref}</Text>
            <View style={s.rule} />
        </View>
    );
}

// Meeting titles and the flag/plate wording are Arabic, and Helvetica has no
// Arabic glyphs — without this every one of them prints as noise.
let arabicReady = false;
export function registerArabic(origin) {
    if (arabicReady) return;
    Font.register({
        family: AR,
        fonts: [
            { src: `${origin}/fonts/NotoSansArabic-Regular.ttf` },
            { src: `${origin}/fonts/NotoSansArabic-Bold.ttf`, fontWeight: 'bold' },
        ],
    });
    arabicReady = true;
}

export async function renderProductionSheetPdf({ data, rows, img }) {
    const doc = (
        <Document title={`Production sheet ${data.ref}`} author={COMPANY.name}>
            <Page size="A4" style={s.page} wrap>
                <Header data={data} />
                <View style={s.footer} fixed>
                    <Text>{data.ministryName} — {data.ref}</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>

                <View style={s.metaBox}>
                    {data.meta.map(([label, value]) => (
                        <Text key={label} style={s.metaCell}>
                            <Text style={s.metaLabel}>{label}: </Text>{value}
                        </Text>
                    ))}
                </View>

                {data.note ? <Text style={s.note}>Note from PICO: {data.note}</Text> : null}

                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>
                    Items to deliver <Text style={{ fontFamily: 'Helvetica', color: MUTED }}>· {rows.length} item{rows.length === 1 ? '' : 's'}</Text>
                </Text>

                <View style={s.th} fixed>
                    <Text style={[s.thCell, s.cNo]}>No</Text>
                    <Text style={[s.thCell, s.cImg]}>Photo</Text>
                    <Text style={[s.thCell, s.cName]}>Item</Text>
                    <Text style={[s.thCell, s.cQty]}>Qty</Text>
                </View>

                {rows.map((r) => {
                    const fit = pickListFor(r.itemNo) && r.selections.length ? selectionFit(r.selections.length, r.qty) : null;
                    return (
                        <View key={`${r.quoteId}:${r.itemNo}`} style={s.row} wrap={false}>
                            <Text style={[s.cell, s.cNo, { color: '#94a3b8' }]}>{isCustomItemNo(r.itemNo) ? '+' : r.itemNo}</Text>
                            <View style={[s.cell, s.cImg]}>
                                {img[r.itemNo] ? <Image style={s.thumb} src={img[r.itemNo]} /> : null}
                            </View>
                            <View style={[s.cell, s.cName]}>
                                <Text>{r.nameSnapshot}</Text>
                                <View style={s.tagRow}>
                                    {SINGLE_STOCK_ITEM_NOS.includes(r.itemNo) ? <Text style={s.tag}>ONE ONLY</Text> : null}
                                    {isCustomItemNo(r.itemNo) ? <Text style={s.tagAdd}>ADDITIONAL</Text> : null}
                                    {data.multi ? <Text style={s.tag}>{r.quoteRef}</Text> : null}
                                </View>
                                {TITLE_ITEM_NOS.includes(r.itemNo) && r.title ? (
                                    <View style={s.titleBox}>
                                        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5 }}>Title</Text>
                                        <Text style={s.arabic}>{r.title}</Text>
                                    </View>
                                ) : null}
                                {fit ? (
                                    <View>
                                        {r.selections.map((t, i) => (
                                            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1.5, paddingLeft: 8 }}>
                                                <Text style={{ fontSize: 8, width: 12 }}>{i + 1}.</Text>
                                                <Text style={[s.arabic, { flex: 1, textAlign: 'left' }]}>{t}</Text>
                                                {PICK_LIST_EN[t] ? <Text style={[s.pickEn, { width: 110 }]}>{PICK_LIST_EN[t]}</Text> : null}
                                            </View>
                                        ))}
                                        {fit.per > 1 ? <Text style={s.per}>{fit.per} of each — {r.qty} total</Text> : null}
                                    </View>
                                ) : null}
                            </View>
                            <Text style={[s.cell, s.cQty, { fontFamily: 'Helvetica-Bold' }]}>{r.qty}</Text>
                        </View>
                    );
                })}

                <Text style={{ fontSize: 7.5, color: MUTED, marginTop: 12 }}>
                    Questions? Ebrahim Mohammed, Project Executive — +973 36357377 · Ebrahim@picobahrain.com
                </Text>
            </Page>
        </Document>
    );
    return renderToBuffer(doc);
}
