'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import ArenaHero from '@/components/storefront/ArenaHero';
import ProductCard from '@/components/storefront/ProductCard';
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
                    <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00A5A5]/30 bg-[#00A5A5]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#00C9C9]">
                        What we rent
                    </span>
                    <h2>Rental Categories</h2>
                    <p>Everything you need for a standout exhibition booth</p>
                </div>
                <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {categories.map((category) => (
                        <Link
                            key={category.slug}
                            href={`/catalogue/${category.slug}`}
                            className="group relative flex flex-col overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-7 no-underline transition-all duration-300 hover:-translate-y-1 hover:border-[#00A5A5]/50 hover:shadow-teal-lg"
                        >
                            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#00A5A5]/15 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00A5A5]/10 text-3xl ring-1 ring-[#00A5A5]/25 transition-transform duration-300 group-hover:scale-110">
                                {category.icon}
                            </div>
                            <h3 className="m-0 text-xl font-extrabold text-white">{category.title}</h3>
                            <p className="mb-0 mt-2 flex-1 text-sm leading-relaxed text-[#9CA3AF]">{category.description}</p>
                            <div className="mt-6 flex items-center justify-between">
                                <span className="inline-flex items-center rounded-full bg-[#00A5A5]/10 px-3 py-1 text-xs font-bold text-[#00C9C9] ring-1 ring-[#00A5A5]/25">
                                    {category.count} {category.count === 1 ? 'item' : 'items'} available
                                </span>
                                <span className="translate-x-0 text-lg text-[#00C9C9] opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">→</span>
                            </div>
                        </Link>
                    ))}
                </div>
              </Reveal>
            </section>

            {!loading && visibleProducts.length > 0 && (
                <section className="section">
                  <Reveal>
                    <div className="section-header">
                        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00A5A5]/30 bg-[#00A5A5]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#00C9C9]">
                            Featured
                        </span>
                        <h2>Catalogue Highlights</h2>
                        <p>Browse our popular exhibition booth extras</p>
                    </div>
                    <div className="products-grid">
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
                    <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#00A5A5]/30 bg-[#00A5A5]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#00C9C9]">
                        How it works
                    </span>
                    <h2>From Order to Booth</h2>
                    <p>Simple 4-step process to get your booth ready</p>
                </div>
                <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {HOME_STEPS.map((step, i) => (
                        <div
                            key={step.title}
                            className="relative rounded-[20px] border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:border-[#00A5A5]/40 hover:bg-white/[0.05]"
                        >
                            <div className="mb-4 flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#00C9C9] to-[#008585] text-sm font-extrabold text-white shadow-teal">
                                    {i + 1}
                                </span>
                                <span className="text-2xl">{step.icon}</span>
                            </div>
                            <h3 className="m-0 text-base font-bold text-white">{step.title}</h3>
                            <p className="mb-0 mt-1.5 text-sm leading-relaxed text-[#9CA3AF]">{step.description}</p>
                        </div>
                    ))}
                </div>
              </Reveal>
            </section>

            <section className="section">
              <Reveal>
                <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-[#00A5A5]/25 bg-gradient-to-br from-[#00A5A5]/15 via-white/[0.03] to-transparent px-6 py-16 text-center sm:px-12">
                    <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#00A5A5]/20 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#00C9C9]/10 blur-3xl" />
                    <span className="relative inline-flex items-center gap-2 rounded-full border border-[#00A5A5]/30 bg-[#00A5A5]/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#00C9C9]">
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
                            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#00C9C9] to-[#00A5A5] px-8 py-4 text-base font-bold text-white no-underline shadow-teal-lg transition-transform duration-300 hover:scale-105"
                        >
                            Browse Catalogue →
                        </Link>
                        <a
                            href="https://wa.me/97336357377"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-white/20 px-8 py-4 text-base font-bold text-white no-underline transition-colors duration-300 hover:border-[#00A5A5]/60 hover:text-[#00C9C9]"
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
