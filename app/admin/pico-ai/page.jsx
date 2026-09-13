import Link from 'next/link';
import AdminShell from '@/components/admin/AdminShell';
import './traditional-ai-cloth-change/pico-ai.css';
export default function Page(){return <AdminShell activeSection="pico-ai"><div className="pico-ai pai-home">
  <header className="pai-heading"><div><span className="pai-eyebrow">PICO / GUEST EXPERIENCES</span><h1>Small moments.<br/>Lasting impressions.</h1><p>Your creative experiences, connected in one place.</p></div><span className="pai-brand-mark" aria-hidden="true">✦</span></header>
  <Link href="/admin/pico-ai/traditional-ai-cloth-change" className="pai-experience-link">
    <div><span className="pai-eyebrow">01 / PICO AI</span><h2>Traditional AI<br/>Cloth Change</h2><p>A new look. A personal keepsake.<br/>An experience your guests can take home.</p><span className="pai-open">Manage experience <span aria-hidden="true">↗</span></span></div>
    <div className="pai-sample-stack" aria-hidden="true"><img src="/pico-ai/abaya-card.webp" alt=""/><img src="/pico-ai/thobe-card.webp" alt=""/><span>SAMPLE LOOKS</span></div>
  </Link>
  <div className="pai-home-notes"><span>01 / Connect your screen</span><span>02 / Welcome your guests</span><span>03 / Share their moment</span></div>
</div></AdminShell>}
