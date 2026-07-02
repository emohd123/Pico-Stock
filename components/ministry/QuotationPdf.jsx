import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { COMPANY } from '@/lib/ministry/company';
import { fmtBHD, fmtBHDRate, amountInWords } from '@/lib/ministry/money';
import { PICO_LOGO_DATA_URI } from '@/lib/ministry/logos';
import { SIGNATURE_DATA_URI } from '@/lib/ministry/signature';

const INK = '#1a1a1a';
const GRAY = '#666666';
const RULE = '#000000';

const s = StyleSheet.create({
    page: { paddingTop: 150, paddingBottom: 40, paddingHorizontal: 34, fontSize: 8, color: INK, fontFamily: 'Helvetica', lineHeight: 1.3 },
    header: { position: 'absolute', top: 22, left: 34, right: 34 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logo: { width: 118 },
    addr: { fontSize: 6.8, color: GRAY, lineHeight: 1.4, width: 150, marginTop: 4 },
    contact: { fontSize: 6.8, color: GRAY, lineHeight: 1.4, marginTop: 4 },
    qBand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10 },
    dateText: { fontSize: 8, color: INK },
    quotationWord: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: INK, textAlign: 'right', lineHeight: 1 },
    refText: { fontSize: 8, color: INK, textAlign: 'right', marginTop: 6 },
    meetingTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, marginTop: 6 },
    footer: { position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: INK, fontFamily: 'Helvetica-Bold' },
    recip: { marginBottom: 8 },
    recipLine: { fontSize: 8, color: INK, marginTop: 1 },
    evRow: { flexDirection: 'row', marginTop: 1.5 },
    evLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: INK, marginRight: 4 },
    evVal: { fontSize: 8, color: INK, textDecoration: 'underline' },
    table: { marginTop: 6 },
    th: { flexDirection: 'row', borderTopWidth: 0.8, borderTopColor: RULE, borderBottomWidth: 0.8, borderBottomColor: RULE, paddingVertical: 3 },
    thCell: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: INK, paddingHorizontal: 3 },
    itemGroup: { marginTop: 12 },
    row: { flexDirection: 'row' },
    cell: { paddingHorizontal: 3, fontSize: 7.8, lineHeight: 1.35 },
    cNo: { width: '4%' }, cScope: { width: '22%' }, cDesc: { width: '43%' }, cQty: { width: '7%', textAlign: 'right' },
    cUnit: { width: '6%', paddingLeft: 4 }, cRate: { width: '9%', textAlign: 'right' }, cCost: { width: '9%', textAlign: 'right' },
    scopeBold: { fontFamily: 'Helvetica-Bold' },
    subLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: INK },
    subDesc: { fontSize: 7.5, color: INK },
    totalsBox: { marginTop: 12, borderWidth: 0.8, borderColor: RULE, padding: 8 },
    totalLine: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 1.5 },
    tlLabel: { fontSize: 8.5, color: INK, textAlign: 'right' },
    tlVat: { width: 40, textAlign: 'center', fontSize: 8.5 },
    tlVal: { width: 90, textAlign: 'right', fontSize: 8.5 },
    tlValU: { width: 90, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textDecoration: 'underline' },
    words: { marginTop: 4, textAlign: 'right', fontSize: 8, textDecoration: 'underline', color: INK },
    section: { marginTop: 14 },
    sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
    intro: { fontSize: 7.5, color: INK, marginBottom: 3 },
    clause: { flexDirection: 'row', marginBottom: 1.5 },
    clauseNo: { width: 16, fontSize: 7.5, color: INK },
    clauseText: { flex: 1, fontSize: 7.5, color: INK },
    sign: { marginTop: 26, flexDirection: 'row', justifyContent: 'space-between' },
    signCol: { width: '45%' },
    signLabel: { fontSize: 8, color: INK, marginBottom: 26 },
    signLabelSigned: { fontSize: 8, color: INK, marginBottom: 2 },
    signImg: { width: 96, height: 24, marginBottom: 0, marginLeft: 2 },
    signLine: { borderTopWidth: 0.8, borderTopColor: RULE, paddingTop: 3, fontSize: 8 },
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
            <View style={s.qBand}>
                <Text style={s.dateText}>{data.dateStr}</Text>
                <View>
                    <Text style={s.quotationWord}>QUOTATION</Text>
                    <Text style={s.refText}>Ref: {data.ref}</Text>
                </View>
            </View>
            <Text style={s.meetingTitle}>{data.eventName || data.ministryName}</Text>
        </View>
    );
}

export function QuotationPdf({ data }) {
    return (
        <Document title={`Quotation ${data.ref}`} author={COMPANY.name}>
            <Page size="A4" style={s.page}>
                <Header data={data} />
                <View style={s.footer} fixed>
                    <Text>CONFIDENTIAL</Text>
                    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
                </View>

                <View style={s.recip}>
                    {data.attentionName ? <Text style={s.recipLine}>{data.attentionName}</Text> : null}
                    {data.attentionTitle ? <Text style={s.recipLine}>{data.attentionTitle}</Text> : null}
                    <Text style={s.recipLine}>{data.ministryName}</Text>
                    {data.poBox ? <Text style={s.recipLine}>{data.poBox}, Kingdom of Bahrain</Text> : null}
                    {data.attentionPhone ? <Text style={s.recipLine}>Tel: {data.attentionPhone}</Text> : null}
                    {(data.contacts || []).map((c, i) => (
                        <Text key={i} style={s.recipLine}>
                            Contact {i + 1}: {c.name}{c.name && c.phone ? ' — ' : ''}{c.phone ? `Tel: ${c.phone}` : ''}
                        </Text>
                    ))}
                    <View style={{ marginTop: 8 }}>
                        <View style={s.evRow}><Text style={s.evLabel}>EVENT :</Text><Text style={s.evVal}>{data.eventName || data.ministryName}</Text></View>
                        {data.venue ? <View style={s.evRow}><Text style={s.evLabel}>VENUE :</Text><Text style={s.evVal}>{data.venue}</Text></View> : null}
                        {data.eventDate ? <View style={s.evRow}><Text style={s.evLabel}>DATE :</Text><Text style={s.evVal}>{data.eventDate}</Text></View> : null}
                        {data.duration ? <View style={s.evRow}><Text style={s.evLabel}>DURATION :</Text><Text style={s.evVal}>{data.duration}</Text></View> : null}
                    </View>
                </View>

                <View style={s.table}>
                    <View style={s.th} fixed>
                        <Text style={[s.thCell, s.cNo]}>No</Text>
                        <Text style={[s.thCell, s.cScope]}>SCOPE OF WORKS</Text>
                        <Text style={[s.thCell, s.cDesc]}>DESCRIPTION</Text>
                        <Text style={[s.thCell, s.cQty]}>QTY</Text>
                        <Text style={[s.thCell, s.cUnit]}>UNIT</Text>
                        <Text style={[s.thCell, s.cRate]}>RATE (BHD)</Text>
                        <Text style={[s.thCell, s.cCost]}>COST (BHD)</Text>
                    </View>
                    {data.lines.map((l, i) => (
                        <View key={i} style={s.itemGroup} wrap={false}>
                            <View style={s.row}>
                                <Text style={[s.cell, s.cNo]}>{i + 1}</Text>
                                <Text style={[s.cell, s.cScope, s.scopeBold]}>{l.scope}</Text>
                                <Text style={[s.cell, s.cDesc]}>{l.mainDesc || ''}</Text>
                                <Text style={[s.cell, s.cQty]}>{l.qty}</Text>
                                <Text style={[s.cell, s.cUnit]}>{l.unit || ''}</Text>
                                <Text style={[s.cell, s.cRate]}>{fmtBHDRate(l.unitPriceFils)}</Text>
                                <Text style={[s.cell, s.cCost]}>{fmtBHD(l.lineTotalFils)}</Text>
                            </View>
                            {(l.subs || []).map((sub, j) => (
                                <View key={j} style={[s.row, { marginTop: 1 }]}>
                                    <Text style={[s.cell, s.cNo]}></Text>
                                    <Text style={[s.cell, s.cScope, s.subLabel]}>{sub.label || ''}</Text>
                                    <Text style={[s.cell, s.cDesc, s.subDesc]}>{sub.desc}</Text>
                                    <Text style={[s.cell, s.cQty]}>{sub.qty || ''}</Text>
                                    <Text style={[s.cell, s.cUnit]}>{sub.unit || ''}</Text>
                                    <Text style={[s.cell, s.cRate]}></Text>
                                    <Text style={[s.cell, s.cCost]}></Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>

                <View style={s.totalsBox} wrap={false}>
                    <View style={s.totalLine}><Text style={s.tlLabel}>Total Cost based on Above Scope of Works</Text><Text style={s.tlVat}></Text><Text style={s.tlVal}>{fmtBHD(data.subtotalFils)}</Text></View>
                    <View style={s.totalLine}><Text style={s.tlLabel}>VAT</Text><Text style={s.tlVat}>10%</Text><Text style={s.tlVal}>{fmtBHD(data.vatFils)}</Text></View>
                    <View style={s.totalLine}><Text style={[s.tlLabel, s.bold]}>TOTAL Cost Including VAT</Text><Text style={s.tlVat}></Text><Text style={s.tlValU}>{fmtBHD(data.totalFils)}</Text></View>
                    <Text style={s.words}>{amountInWords(data.totalFils)}</Text>
                </View>

                <View style={s.sign} wrap={false}>
                    <View style={s.signCol}>
                        <Text style={s.signLabelSigned}>For Pico International (Bahrain)</Text>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image style={s.signImg} src={SIGNATURE_DATA_URI} />
                        <View style={s.signLine}><Text style={s.bold}>{COMPANY.signatory.name}</Text><Text>{COMPANY.signatory.title}</Text></View>
                    </View>
                    <View style={s.signCol}>
                        <Text style={s.signLabel}>For {data.ministryName}</Text>
                        <View style={s.signLine}><Text>Authorized signatory</Text><Text>Date</Text></View>
                    </View>
                </View>
                <Text style={{ marginTop: 10, fontSize: 7.5, color: INK }}>To confirm your order, please sign above and return a copy of this quotation along with a Purchase Order. Thank you.</Text>
            </Page>
        </Document>
    );
}

export async function renderQuotationPdf(data) {
    return renderToBuffer(<QuotationPdf data={data} />);
}
