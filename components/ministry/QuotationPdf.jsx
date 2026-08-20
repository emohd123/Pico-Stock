import { Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY, PAYMENT_TERMS } from '@/lib/ministry/company';
import { fmtBHD, fmtBHDRate, amountInWords } from '@/lib/ministry/money';
import { PICO_LOGO_DATA_URI } from '@/lib/ministry/logos';
import { SIGNATURE_DATA_URI } from '@/lib/ministry/signature';

// The generated quotation, laid out to match the documents PICO issues by hand
// (Q/08/2026/EM/11988 Rev 2 was the reference): company header on every page,
// the recipient block, one table with a grey header band, the totals stack, the
// payment terms and the two signature columns.
//
// When the quotation carries additional items the totals split the way the
// issued documents do — A for the main scope, B for the additions, then A + B —
// and section B restarts its numbering at 1.

// react-pdf hyphenates by default, which split words mid-syllable in the narrow
// columns — "Table-top Floral Arrange-ment". Issued quotations never hyphenate.
Font.registerHyphenationCallback((word) => [word]);

const INK = '#1a1a1a';
const GRAY = '#666666';
const RULE = '#000000';
const HAIR = '#999999';
const BAND = '#EFEFEF';

const s = StyleSheet.create({
    page: { paddingTop: 150, paddingBottom: 46, paddingHorizontal: 31, fontSize: 7.2, color: INK, fontFamily: 'Helvetica', lineHeight: 1.35 },

    // ---- header, repeated on every page ----
    header: { position: 'absolute', top: 22, left: 31, right: 31 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logo: { width: 96 },
    addr: { fontSize: 6.8, color: GRAY, lineHeight: 1.45, width: 160, marginTop: 2 },
    contact: { fontSize: 6.8, color: GRAY, lineHeight: 1.45, marginTop: 2, textAlign: 'right' },
    quotationWord: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, textAlign: 'right', marginTop: 14 },
    refRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 5 },
    dateText: { fontSize: 8, color: INK },
    refText: { fontSize: 8, color: INK, textAlign: 'right' },

    // ---- recipient ----
    meetingTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 7 },
    recipLine: { fontSize: 8, color: INK, marginTop: 1.5 },
    recipOrg: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 1.5 },
    evBlock: { marginTop: 10 },
    evRow: { flexDirection: 'row', marginTop: 2 },
    evLabel: { width: 88, fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK },
    evVal: { fontSize: 8, color: INK, flex: 1 },

    // ---- table ----
    table: { marginTop: 11 },
    th: { flexDirection: 'row', backgroundColor: BAND, borderTopWidth: 0.7, borderTopColor: RULE, borderBottomWidth: 0.7, borderBottomColor: RULE, paddingVertical: 3.5 },
    thCell: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, color: INK, paddingHorizontal: 4 },
    itemGroup: { marginTop: 5 },
    row: { flexDirection: 'row' },
    cell: { paddingHorizontal: 4, fontSize: 7.2, lineHeight: 1.35 },
    cNo: { width: '3.7%', textAlign: 'center' },
    cScope: { width: '19.2%' },
    cDesc: { width: '45.3%' },
    cQty: { width: '4.8%', textAlign: 'center' },
    cUnit: { width: '4.8%', textAlign: 'center' },
    cRate: { width: '11.1%', textAlign: 'right' },
    cCost: { width: '11.1%', textAlign: 'right' },
    scopeBold: { fontFamily: 'Helvetica-Bold' },
    subText: { fontSize: 7.2, color: INK },
    subQty: { fontFamily: 'Helvetica-Oblique', color: GRAY },

    // ---- section banners (only when there are additional items) ----
    band: { marginTop: 14, backgroundColor: BAND, borderTopWidth: 0.7, borderTopColor: RULE, borderBottomWidth: 0.7, borderBottomColor: RULE, paddingVertical: 3.5, paddingHorizontal: 4 },
    bandText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: INK },

    // ---- totals ----
    totals: { marginTop: 11, borderTopWidth: 0.7, borderTopColor: RULE },
    totalRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingVertical: 3.5, borderBottomWidth: 0.4, borderBottomColor: HAIR },
    totalRowLast: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1.6, borderBottomColor: RULE, borderTopWidth: 0.4, borderTopColor: HAIR },
    tlLabel: { fontSize: 8, color: INK, textAlign: 'right', paddingRight: 10 },
    tlVal: { width: 100, textAlign: 'right', fontSize: 8, paddingRight: 4 },
    words: { marginTop: 6, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Oblique', color: INK },

    // ---- payment terms ----
    terms: { marginTop: 16 },
    termsTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, paddingBottom: 3, borderBottomWidth: 0.7, borderBottomColor: RULE },
    clause: { flexDirection: 'row', marginTop: 5 },
    clauseNo: { width: 18, fontSize: 7.5, color: INK, textAlign: 'right', paddingRight: 6 },
    clauseText: { flex: 1, fontSize: 7.5, color: INK },
    confirm: { marginTop: 14, fontSize: 7.5, color: INK },

    // ---- signatures ----
    sign: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between' },
    signCol: { width: '46%' },
    signFor: { fontSize: 8, color: INK },
    signImg: { width: 92, height: 23, marginTop: 4, marginLeft: 4 },
    signGap: { height: 27 },
    signRule: { borderTopWidth: 0.7, borderTopColor: RULE, paddingTop: 3 },
    signName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK },
    signTitle: { fontSize: 8, color: INK },

    // ---- footer, repeated ----
    // No border on this block: a border on an absolutely positioned fixed view
    // stops react-pdf drawing it at all. The rule above it is its own line.
    // Positioned from the top, not the bottom: react-pdf lays a `fixed` block
    // out against the page box, and a bottom-anchored one with no height never
    // gets drawn. A4 is 842pt tall, so 806 puts this in the bottom margin.
    footRule: { position: 'absolute', top: 800, left: 31, right: 31, borderTopWidth: 0.4, borderTopColor: HAIR },
    footLeft: { position: 'absolute', top: 806, left: 31, fontSize: 7, color: GRAY },
    footRight: { position: 'absolute', top: 806, right: 31, fontSize: 7, color: GRAY, textAlign: 'right' },
    bold: { fontFamily: 'Helvetica-Bold' },
});

function Header({ data }) {
    return (
        <View style={s.header} fixed>
            <View style={s.topRow}>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={s.logo} src={PICO_LOGO_DATA_URI} />
                <Text style={s.addr}>{COMPANY.name}{'\n'}{COMPANY.addressLines.join('\n')}</Text>
                <Text style={s.contact}>{COMPANY.email}{'\n'}Tel: {COMPANY.tel}{'\n'}Fax: {COMPANY.fax}{'\n'}{COMPANY.web}{'\n'}VAT: {COMPANY.vat}</Text>
            </View>
            <Text style={s.quotationWord}>QUOTATION</Text>
            <View style={s.refRow}>
                <Text style={s.dateText}>{data.dateStr}</Text>
                <Text style={s.refText}>Ref: {data.ref}</Text>
            </View>
        </View>
    );
}

function TableHead() {
    return (
        <View style={s.th} fixed>
            <Text style={[s.thCell, s.cNo]}>No</Text>
            <Text style={[s.thCell, s.cScope]}>SCOPE OF WORKS</Text>
            <Text style={[s.thCell, s.cDesc]}>DESCRIPTION</Text>
            <Text style={[s.thCell, s.cQty]}>QTY</Text>
            <Text style={[s.thCell, s.cUnit]}>UNIT</Text>
            <Text style={[s.thCell, s.cRate]}>RATE (BHD)</Text>
            <Text style={[s.thCell, s.cCost]}>COST (BHD)</Text>
        </View>
    );
}

// One quoted item: the priced row, then its sub-lines under the description.
// A sub-line's quantity rides at the end of its own text in italics, as on the
// issued documents — it is part of that detail, not a second priced quantity.
function ItemRows({ line, no }) {
    // The description and its sub-lines share one cell. As separate table rows
    // they detached from each other whenever the scope column wrapped, leaving a
    // blank band between an item and its own detail.
    return (
        <View style={[s.itemGroup, s.row]} wrap={false}>
            <Text style={[s.cell, s.cNo]}>{no}</Text>
            <Text style={[s.cell, s.cScope, s.scopeBold]}>{line.scope}</Text>
            <View style={[s.cell, s.cDesc]}>
                {line.mainDesc ? <Text>{line.mainDesc}</Text> : null}
                {(line.subs || []).map((sub, j) => (
                    <Text key={j} style={s.subText}>
                        {sub.label ? <Text style={s.bold}>{sub.label} </Text> : null}
                        {sub.desc}
                        {sub.qty ? <Text style={s.subQty}>{'   '}({sub.qty}{sub.unit ? ` ${sub.unit}` : ''})</Text> : null}
                    </Text>
                ))}
            </View>
            <Text style={[s.cell, s.cQty]}>{line.qty}</Text>
            <Text style={[s.cell, s.cUnit]}>{line.unit || ''}</Text>
            <Text style={[s.cell, s.cRate]}>{fmtBHDRate(line.unitPriceFils)}</Text>
            <Text style={[s.cell, s.cCost]}>{fmtBHD(line.lineTotalFils)}</Text>
        </View>
    );
}

function Totals({ label, subtotalFils, vatFils, totalFils }) {
    return (
        <View style={s.totals} wrap={false}>
            {label ? <View style={[s.band, { marginTop: 0 }]}><Text style={s.bandText}>{label}</Text></View> : null}
            <View style={s.totalRow}>
                <Text style={s.tlLabel}>Total Cost based on Above Scope of Works</Text>
                <Text style={s.tlVal}>{fmtBHD(subtotalFils)}</Text>
            </View>
            <View style={s.totalRow}>
                <Text style={s.tlLabel}>VAT 10%</Text>
                <Text style={s.tlVal}>{fmtBHD(vatFils)}</Text>
            </View>
            <View style={s.totalRowLast}>
                <Text style={[s.tlLabel, s.bold]}>TOTAL Cost Including VAT</Text>
                <Text style={[s.tlVal, s.bold]}>{fmtBHD(totalFils)}</Text>
            </View>
            <Text style={s.words}>{amountInWords(totalFils)}</Text>
        </View>
    );
}

const vatOf = (n) => Math.round(n * 0.1);

export function QuotationPdf({ data }) {
    const lines = data.lines || [];
    const extras = data.extraLines || [];
    const split = extras.length > 0;          // additional items get their own section
    const mainSub = lines.reduce((n, l) => n + (l.lineTotalFils || 0), 0);
    const extraSub = extras.reduce((n, l) => n + (l.lineTotalFils || 0), 0);
    const terms = PAYMENT_TERMS;

    return (
        <Document title={`Quotation ${data.ref}`} author={COMPANY.name}>
            <Page size="A4" style={s.page}>
                <Header data={data} />
                {/* The footer sits last: a fixed block declared before the flow
                    content is measured against an empty page and never drawn. */}

                <Text style={s.meetingTitle}>{(data.eventName || data.ministryName || '').toUpperCase()}</Text>
                {(data.contacts || []).slice(0, 1).map((c, i) => (
                    <Text key={i} style={s.recipLine}>{[c.name, c.title].filter(Boolean).join(' — ')}</Text>
                ))}
                <Text style={s.recipOrg}>{data.ministryName}</Text>
                {data.address ? <Text style={s.recipLine}>{data.address}</Text> : null}
                {data.poBox ? <Text style={s.recipLine}>{data.poBox}, Kingdom of Bahrain</Text> : null}
                {(data.contacts || []).map((c, i) => {
                    const line = [c.phone ? `Tel: ${c.phone}` : '', c.email].filter(Boolean).join(' | ');
                    return line ? <Text key={i} style={s.recipLine}>{line}</Text> : null;
                })}
                {/* A second contact is named in full; the first is already above. */}
                {(data.contacts || []).slice(1).map((c, i) => (
                    <Text key={i} style={s.recipLine}>{[c.name, c.title].filter(Boolean).join(' — ')}</Text>
                ))}

                <View style={s.evBlock}>
                    <View style={s.evRow}><Text style={s.evLabel}>EVENT</Text><Text style={s.evVal}>: {data.eventName || data.ministryName}</Text></View>
                    {data.venue ? <View style={s.evRow}><Text style={s.evLabel}>VENUE</Text><Text style={s.evVal}>: {data.venue}</Text></View> : null}
                    {data.eventDate ? <View style={s.evRow}><Text style={s.evLabel}>DATE</Text><Text style={s.evVal}>: {data.eventDate}</Text></View> : null}
                    {data.duration ? <View style={s.evRow}><Text style={s.evLabel}>DURATION</Text><Text style={s.evVal}>: {data.duration}</Text></View> : null}
                </View>

                <View style={s.table}>
                    <TableHead />
                    {lines.map((l, i) => <ItemRows key={i} line={l} no={i + 1} />)}
                </View>

                {split ? (
                    <>
                        <Totals label="A.  MAIN SCOPE OF WORKS" subtotalFils={mainSub} vatFils={vatOf(mainSub)} totalFils={mainSub + vatOf(mainSub)} />
                        <View style={s.band} wrap={false}><Text style={s.bandText}>B.  ADDITIONAL ITEMS</Text></View>
                        <View style={s.table}>
                            <TableHead />
                            {/* section B numbers from 1 again, as on the issued documents */}
                            {extras.map((l, i) => <ItemRows key={i} line={l} no={i + 1} />)}
                        </View>
                        <Totals label="B.  ADDITIONAL ITEMS" subtotalFils={extraSub} vatFils={vatOf(extraSub)} totalFils={extraSub + vatOf(extraSub)} />
                        <Totals label="A + B.  TOTAL INCLUDING ADDITIONAL ITEMS"
                            subtotalFils={data.subtotalFils} vatFils={data.vatFils} totalFils={data.totalFils} />
                    </>
                ) : (
                    <Totals subtotalFils={data.subtotalFils} vatFils={data.vatFils} totalFils={data.totalFils} />
                )}

                <View style={s.terms} wrap={false}>
                    <Text style={s.termsTitle}>PAYMENT TERMS &amp; SCHEDULE</Text>
                    {terms.map((t, i) => (
                        <View key={i} style={s.clause}>
                            <Text style={s.clauseNo}>{i + 1}</Text>
                            <Text style={s.clauseText}>{t}</Text>
                        </View>
                    ))}
                    <Text style={s.confirm}>To confirm your order, please sign below and return a copy of this quotation along with a Purchase Order. Thank you.</Text>
                </View>

                <View style={s.sign} wrap={false}>
                    <View style={s.signCol}>
                        <Text style={s.signFor}>For Pico International (Bahrain)</Text>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image style={s.signImg} src={SIGNATURE_DATA_URI} />
                        <View style={s.signRule}>
                            <Text style={s.signName}>{COMPANY.signatory.name}</Text>
                            <Text style={s.signTitle}>{COMPANY.signatory.title}</Text>
                        </View>
                    </View>
                    <View style={s.signCol}>
                        <Text style={s.signFor}>For {data.ministryName}</Text>
                        <View style={s.signGap} />
                        <View style={s.signRule}>
                            <Text style={s.signTitle}>Authorized signatory</Text>
                            <Text style={s.signTitle}>Date</Text>
                        </View>
                    </View>
                </View>

                {/* Two separate fixed texts rather than a flex row: a `render`
                    callback inside an absolutely positioned row never draws. */}
                <View style={s.footRule} fixed />
                <Text style={s.footLeft} fixed>Confidential</Text>
                <Text style={s.footRight} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
            </Page>
        </Document>
    );
}

export async function renderQuotationPdf(data) {
    return renderToBuffer(<QuotationPdf data={data} />);
}
