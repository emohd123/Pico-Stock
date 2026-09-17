'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AdminShell from '@/components/admin/AdminShell';
import '../traditional-ai-cloth-change/pico-ai.css';
import './reports.css';

const ranges = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['all', 'All time']];
const number = new Intl.NumberFormat('en-GB');

export default function LandmarkQrReportsPage() {
  const [range, setRange] = useState('30d');
  const [country, setCountry] = useState('All');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch(`/api/pico-ai/admin/landmark-scans?range=${range}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Report unavailable'); return body; })
      .then(setData)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message); });
    return () => controller.abort();
  }, [range]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.landmarks || []).filter((item) => (country === 'All' || item.country === country) && (!query || `${item.reference} ${item.name}`.toLowerCase().includes(query)));
  }, [data, country, search]);

  return <AdminShell activeSection="landmark-qr"><main className="pico-ai qr-report">
    <header className="pai-heading qr-heading">
      <div><span className="pai-eyebrow">PICO AI / BIA NATIONAL DAY</span><h1>Landmark QR<br/>Scan Reports</h1><p>One clear view of what travellers scan, revisit and explore.</p></div>
      <div className="qr-live-mark" aria-label="Report tracking status"><span></span><strong>{data?.installed ? 'Tracking ready' : 'Setup required'}</strong><small>No IP addresses stored</small></div>
    </header>

    <div className="qr-range" aria-label="Report period">{ranges.map(([value, label]) => <button key={value} className={range === value ? 'selected' : ''} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}</div>
    {error && <p className="pai-error" role="alert">{error}</p>}
    {!data && !error && <div className="pai-loading"><span></span>Preparing the scan report…</div>}
    {data && <>
      {!data.installed && <section className="qr-setup-note"><strong>Tracking database is not installed yet.</strong><span>The dashboard and QR files are ready. Apply the included Supabase migration to begin recording scans.</span></section>}
      <section className="qr-kpis" aria-label="Scan overview">
        <article><span>Total scans</span><strong>{number.format(data.summary.totalScans)}</strong><small>All QR opens in this period</small></article>
        <article><span>Unique visitors</span><strong>{number.format(data.summary.uniqueVisitors)}</strong><small>Anonymous browser count</small></article>
        <article><span>Landmarks scanned</span><strong>{data.summary.scannedLandmarks}<em>/{data.summary.totalLandmarks}</em></strong><small>Saudi Arabia and Bahrain</small></article>
        <article className="top-landmark"><span>Top landmark</span><strong>{data.summary.topLandmark?.name || 'Waiting for scans'}</strong><small>{data.summary.topLandmark ? `${number.format(data.summary.topLandmark.scans)} scans` : 'Your first scan will appear here'}</small></article>
      </section>

      <section className="qr-report-grid">
        <article className="pai-card qr-chart"><div className="qr-card-heading"><div><span className="pai-eyebrow">DAILY PULSE</span><h2>Scans over time</h2></div><strong>{number.format(data.summary.totalScans)}</strong></div><div className="qr-chart-frame"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily}><CartesianGrid stroke="#dde5d8" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#607367'}}/><YAxis allowDecimals={false} width={26} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#607367'}}/><Tooltip contentStyle={{borderRadius:12,border:'1px solid #d3ddcf'}}/><Line type="monotone" dataKey="scans" stroke="#ad2b38" strokeWidth={3} dot={false} activeDot={{r:5,fill:'#153f34'}}/></LineChart></ResponsiveContainer></div></article>
        <article className="pai-card qr-chart"><div className="qr-card-heading"><div><span className="pai-eyebrow">AUDIENCE</span><h2>Device mix</h2></div></div><div className="qr-chart-frame"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.devices}><CartesianGrid stroke="#dde5d8" vertical={false}/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#607367'}}/><YAxis allowDecimals={false} width={26} tickLine={false} axisLine={false} tick={{fontSize:11,fill:'#607367'}}/><Tooltip contentStyle={{borderRadius:12,border:'1px solid #d3ddcf'}}/><Bar dataKey="scans" fill="#1d725d" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div></article>
      </section>

      <section className="qr-insight"><span className="qr-insight-star" aria-hidden="true">✦</span><div><span className="pai-eyebrow">PICO AI SUMMARY</span><h2>{data.insight.title}</h2><p>{data.insight.body}</p></div></section>

      <section className="pai-card qr-library"><div className="qr-library-head"><div><span className="pai-eyebrow">QR LIBRARY · 50 POSTCARD STORIES</span><h2>Every landmark, one trackable link</h2><p>Open the bilingual postcard or download its matching QR. Existing printed references stay the same.</p><a className="qr-download" href="/landmarks" target="_blank" rel="noreferrer">Browse all 50 stories ↗</a></div><div className="qr-filters"><label><span>Country</span><select value={country} onChange={(event) => setCountry(event.target.value)}><option>All</option><option>Saudi Arabia</option><option>Bahrain</option></select></label><label><span>Find landmark</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or reference"/></label></div></div>
        <div className="pai-table"><table><thead><tr><th>Ref.</th><th>Landmark</th><th>Country</th><th>Scans</th><th>Visitors</th><th>Last scan</th><th>Postcard</th><th>QR</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.reference}</strong></td><td>{item.name}</td><td><span className={`qr-country ${item.country === 'Bahrain' ? 'bahrain' : ''}`}>{item.country}</span></td><td>{number.format(item.scans)}</td><td>{number.format(item.uniqueVisitors)}</td><td>{item.lastScan ? new Date(item.lastScan).toLocaleString() : '—'}</td><td><a className="qr-download" href={`/landmarks/${item.id}`} target="_blank" rel="noreferrer">Open page ↗</a></td><td><a className="qr-download" href={`/api/pico-ai/admin/landmark-qr/${item.id}`} download={`${item.reference}-${item.id}-QR.svg`}>Download QR</a></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </main></AdminShell>;
}
