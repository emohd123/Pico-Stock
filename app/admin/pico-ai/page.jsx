import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import './traditional-ai-cloth-change/pico-ai.css';
import '@/components/event-studio/event-studio.css';
export default function Page(){return <AdminShell activeSection="pico-ai"><div className="pico-ai pai-home">
  <header className="pai-heading"><div><span className="pai-eyebrow">PICO / GUEST EXPERIENCES</span><h1>Small moments.<br/>Lasting impressions.</h1><p>Your creative experiences, connected in one place.</p></div><span className="pai-brand-mark" aria-hidden="true">✦</span></header>
  <Link href="/admin/pico-ai/traditional-ai-cloth-change" className="pai-experience-link">
    <div><span className="pai-eyebrow">01 / PICO AI</span><h2>Traditional AI<br/>Cloth Change</h2><p>A new look. A personal keepsake.<br/>An experience your guests can take home.</p><span className="pai-open">Manage experience <span aria-hidden="true">↗</span></span></div>
    <div className="pai-sample-stack" aria-hidden="true"><img src="/pico-ai/abaya-card.webp" alt=""/><img src="/pico-ai/thobe-card.webp" alt=""/><span>SAMPLE LOOKS</span></div>
  </Link>
  <Link href="/admin/pico-ai/landmark-qr-reports" className="pai-experience-link pai-qr-experience-link">
    <div><span className="pai-eyebrow">02 / PICO AI</span><h2>Landmark QR<br/>Scan Reports</h2><p>See which stories guests discover.<br/>Live scan totals, trends and landmark performance.</p><span className="pai-open">Open reports <span aria-hidden="true">↗</span></span></div>
    <div className="pai-qr-card-art" aria-hidden="true">
      <span className="pai-qr-signal"><i></i><i></i><i></i></span>
      <div className="pai-qr-mini-code">▦</div>
      <div className="pai-qr-bars"><i></i><i></i><i></i><i></i><i></i></div>
      <strong>LIVE SCAN PULSE</strong><small>50 LANDMARK STORIES</small>
    </div>
  </Link>
  <Link href="/admin/pico-ai/name-art" className="pai-experience-link"><div><span className="pai-eyebrow">03 / NAME ART</span><h2>Your name.<br/>A beautiful memory.</h2><p>iPad entry, a live poster-screen reveal,<br/>and a private QR keepsake.</p><span className="pai-open">Manage Name Art ↗</span></div><img src="/name-art/pearls.webp" alt="Pearl and ribbon Name Art background" style={{height:280,width:'auto',borderRadius:8}}/></Link>
  <Link href="/admin/pico-ai/royal-bahrain-concours-2026" className="pai-experience-link es-hub-card"><div><span className="pai-eyebrow">04 / SPATIAL STUDIO</span><h2>Royal Bahrain<br/>Concours 2026</h2><p>Walk the site. Step inside every tent.<br/>Arrange the details, in real time.</p><span className="pai-open">Open 3D Event Studio ↗</span></div><img className="es-hub-preview" src="/event-studio/rbc-overview.webp" alt="Royal Bahrain Concours three-dimensional site overview"/></Link>
  <div className="pai-home-notes"><span>Create</span><span>Celebrate</span><span>Take the memory home</span></div>
</div></AdminShell>}
