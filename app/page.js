'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import ArenaHero from '@/components/storefront/ArenaHero';
import ProductCard from '@/components/storefront/ProductCard';
import Icon from '@/components/storefront/Icon';
import Reveal from '@/components/Reveal';
import { useProducts } from '@/hooks/useProducts';
import { useCart } from '@/lib/cartContext';
import { getVisibleProducts, HOME_STEPS, SHOP_CATEGORIES } from '@/lib/storefront/catalogue';

export default function HomePage() {
    const { products, loading } = useProducts();
    const { toast } = useCart();
    const visibleProducts = useMemo(() => getVisibleProducts(products), [products]);
    const categories = useMemo(() => (
        SHOP_CATEGORIES
            .filter((category) => category.value !== 'all')
            .map((category) => ({
                ...category,
                count: visibleProducts.filter((product) => product.category === category.value).length,
            }))
    ), [visibleProducts]);

    return (
        <div className="page-enter">
            <ArenaHero />

            <section className="section">
              <Reveal>
                <div className="section-header">
                    <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00C7B1]/30 bg-[#00C7B1]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#1FD8C2]">
                        What we rent
                    </span>
                    <h2>Rental Categories</h2>
                    <p>Everything you need for a standout exhibition booth</p>
                </div>
                <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map((category) => (
                        <div
                            key={category.slug}
                            className="group relative flex flex-col overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-9 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#00C7B1]/50 hover:shadow-teal-lg lg:p-11"
                        >
                            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#00C7B1]/15 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
                            <div className="mb-6 inline-flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-[#00C7B1]/10 text-[#00C7B1] ring-1 ring-[#00C7B1]/25 transition-transform duration-300 group-hover:scale-110">
                                <Icon name={category.iconKey} size={32} />
                            </div>
                            <h3 className="m-0 text-2xl font-extrabold text-white">{category.title}</h3>
                            <p className="mb-0 mt-3 text-[0.95rem] leading-relaxed text-[#9CA3AF]">{category.description}</p>
                        </div>
                    ))}
                </div>
              </Reveal>
            </section>

            {!loading && visibleProducts.length > 0 && (
                <section className="section">
                  <Reveal>
                    <div className="section-header">
                        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00C7B1]/30 bg-[#00C7B1]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#1FD8C2]">
                            Featured
                        </span>
                        <h2>Catalogue Highlights</h2>
                        <p>Browse our popular exhibition booth extras</p>
                    </div>
                    <div className="mx-auto grid max-w-[1560px] grid-flow-col auto-cols-[minmax(220px,1fr)] gap-6 overflow-x-auto pb-3">
                        {[...visibleProducts].reverse().slice(0, 6).map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                    {visibleProducts.length > 6 && (
                        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
                            <Link href="/catalogue" className="btn btn-secondary btn-lg" style={{ borderRadius: '30px', padding: '1rem 3rem' }}>
                                Show More Items
                            </Link>
                        </div>
                    )}
                  </Reveal>
                </section>
            )}

            <section className="section">
              <Reveal>
                <div className="section-header">
                    <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00C7B1]/30 bg-[#00C7B1]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#1FD8C2]">
                        How it works
                    </span>
                    <h2>From Order to Booth</h2>
                    <p>Simple 4-step process to get your booth ready</p>
                </div>
                <div className="mx-auto grid max-w-[1560px] grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-4">
                    {HOME_STEPS.map((step, i) => (
                        <div
                            key={step.title}
                            className="relative rounded-[24px] border border-white/10 bg-white/[0.03] p-9 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#00C7B1]/40 hover:bg-white/[0.05] hover:shadow-teal-lg"
                        >
                            <div className="mb-6 flex items-center gap-4">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#1FD8C2] to-[#00A593] text-lg font-extrabold text-white shadow-teal">
                                    {i + 1}
                                </span>
                                <span className="text-[#00C7B1]"><Icon name={step.iconKey} size={26} /></span>
                            </div>
                            <h3 className="m-0 text-xl font-bold text-white">{step.title}</h3>
                            <p className="mb-0 mt-2.5 text-[0.95rem] leading-relaxed text-[#9CA3AF]">{step.description}</p>
                        </div>
                    ))}
                </div>
              </Reveal>
            </section>

            <section className="section">
              <Reveal>
                <div className="brand-corners relative mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-[#00C7B1]/25 bg-gradient-to-br from-[#00C7B1]/15 via-white/[0.03] to-transparent px-6 py-16 text-center sm:px-12">
                    <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#00C7B1]/20 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#1FD8C2]/10 blur-3xl" />
                    <span className="relative inline-flex items-center gap-2 rounded-full border border-[#00C7B1]/30 bg-[#00C7B1]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#1FD8C2]">
                        Ready when you are
                    </span>
                    <h2 className="relative mx-auto mt-4 max-w-2xl text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                        Ready to build your booth?
                    </h2>
                    <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-[#9CA3AF]">
                        Browse the catalogue, add what you need, and our Bahrain team will prepare your quote and handle delivery &amp; installation.
                    </p>
                    <div className="relative mt-9 flex flex-wrap items-center justify-center gap-4">
                        <Link
                            href="/catalogue"
                            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#1FD8C2] to-[#00C7B1] px-8 py-4 text-base font-bold text-white no-underline shadow-teal-lg transition-transform duration-300 hover:scale-105"
                        >
                            Browse Catalogue →
                        </Link>
                        <a
                            href="https://wa.me/97336357377"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full bg-[#FF8200] px-8 py-4 text-base font-bold text-white no-underline shadow-lg transition-transform duration-300 hover:scale-105"
                        >
                            WhatsApp Us
                        </a>
                    </div>
                </div>
              </Reveal>
            </section>

            {toast && (
                <div className="toast">
                    {'\u2705'} {toast}
                </div>
            )}
        </div>
    );
}
