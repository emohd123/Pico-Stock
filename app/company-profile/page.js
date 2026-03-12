import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
    title: 'Company Profile — Pico Bahrain Exhibition, Events & Interiors',
    description: 'Discover Pico Bahrain and explore our exhibition stands, event environments, interiors, graphics, AV support, and booth-ready rental solutions.',
};

const capabilityCards = [
    {
        title: 'Exhibition Stands',
        description: 'Design-led exhibition stands and branded environments shaped for live events, trade shows, and business-facing activations.',
        image: '/company/cap-exhibition.png',
    },
    {
        title: 'Event Environments',
        description: 'Integrated event support for visitor flow, hospitality spaces, feature areas, and presentation-ready brand experiences.',
        image: '/company/cap-events.png',
    },
    {
        title: 'Interiors & Fit-Out',
        description: 'Interior solutions for branded spaces, receptions, lounges, and functional environments that need a clean professional finish.',
        image: '/company/cap-interiors.png',
    },
    {
        title: 'Booth Furniture & Rental Support',
        description: 'Flexible furniture and booth extras rental to complete exhibition spaces quickly, consistently, and with local coordination.',
        image: '/company/cap-furniture.png',
    },
    {
        title: 'Graphics & Signage',
        description: 'Visual communication support across booth graphics, branded surfaces, directional messaging, and presentation-ready signage.',
        image: '/company/cap-graphics.png',
    },
    {
        title: 'AV & Digital Display Support',
        description: 'Screen-based and presentation-focused support for digital content, display moments, and high-visibility touchpoints.',
        image: '/company/cap-av.png',
    },
];

const portfolioHighlights = [
    {
        title: 'Events Portfolio',
        description: 'A Bahrain-focused overview of event environments, client-facing experiences, and delivery capabilities across live projects.',
        image: '/company/portfolio-events.png',
        href: 'https://u.pcloud.link/publink/show?code=XZOwzq5ZCX8ABOA4HHRp92vxfuoa80RX7bRV',
        linkLabel: 'View Events Portfolio',
    },
    {
        title: 'Exhibition Stands Portfolio',
        description: "Reference material showing Pico Bahrain's exhibition-stand direction, booth presentation quality, and spatial execution style.",
        image: '/company/portfolio-stands.png',
        href: 'https://u.pcloud.link/publink/show?code=XZHFte5Zk0MLSfIJLGLAW8fqj1l8juMDH4s7',
        linkLabel: 'View Stands Portfolio',
    },
    {
        title: 'Interiors Portfolio',
        description: 'A supporting look at interior-focused work and space styling that complements exhibition and event delivery.',
        image: '/company/portfolio-interiors.png',
        href: 'https://u.pcloud.link/publink/show?code=XZLCzq5ZuOJCabuPOMLh0WtIdgPaukB0sI5y',
        linkLabel: 'View Interiors Portfolio',
    },
];

const valuePoints = [
    'Local Bahrain coordination with a delivery mindset built around event-ready execution.',
    'Integrated support across space design, rental requirements, graphics, and presentation finishes.',
    'A practical design-to-delivery approach that helps brands move from concept to setup with fewer handoffs.',
    'Flexible capability for exhibitions, event environments, interiors, and supporting booth requirements.',
];

export default function CompanyProfilePage() {
    return (
        <div className="page-enter company-profile-page">
            <section className="company-hero">
                <div className="company-hero-copy">
                    <span className="hero-badge">Pico Bahrain Company Profile</span>
                    <h1>
                        Exhibition, Event, and Interior
                        <span className="highlight"> Solutions Built for Brand Experiences</span>
                    </h1>
                    <p className="hero-subtitle company-hero-subtitle">
                        Pico Bahrain supports brands with exhibition environments, event delivery, interiors, graphics,
                        and booth-ready rental solutions. We help turn physical spaces into professional experiences that
                        are prepared for visitors, presentations, and live interaction.
                    </p>
                    <div className="hero-actions company-hero-actions">
                        <Link href="/catalogue" className="btn btn-primary btn-lg">
                            Explore Catalogue
                        </Link>
                        <a
                            href="https://pico.com/en"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-lg"
                        >
                            Visit Pico Global
                        </a>
                    </div>
                </div>

                <div className="company-hero-media">
                    <div className="company-hero-main-image">
                        <Image
                            src="/company/events-p12.png"
                            alt="Pico Bahrain exhibition stand — Future Energy Asia Bangkok"
                            fill
                            sizes="(max-width: 768px) 100vw, 46vw"
                            className="company-media-image company-media-image-poster company-media-image-poster-main company-media-image-stage"
                            priority
                        />
                    </div>
                    <div className="company-hero-rail">
                        <div className="company-hero-rail-card">
                            <Image
                                src="/company/stands-p15.png"
                                alt="Bahrain International Garden exhibition pavilion"
                                fill
                                sizes="(max-width: 768px) 50vw, 20vw"
                                className="company-media-image company-media-image-poster company-media-image-stage"
                            />
                        </div>
                        <div className="company-hero-rail-card">
                            <Image
                                src="/company/int-p29.png"
                                alt="Bahrain Marina exhibition stand with LED floor"
                                fill
                                sizes="(max-width: 768px) 50vw, 20vw"
                                className="company-media-image company-media-image-poster company-media-image-interior"
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section className="section company-section">
                <div className="company-split">
                    <div className="company-split-copy">
                        <div className="section-header company-section-header company-section-header-left">
                            <h2>Who We Are</h2>
                            <p>Pico Bahrain combines local execution with the wider credibility of the Pico brand.</p>
                        </div>
                        <div className="company-copy-stack">
                            <p>
                                Pico is internationally known for building branded environments, exhibition experiences,
                                and event-facing spaces. In Bahrain, that translates into locally coordinated support for
                                clients who need reliable execution, professional presentation, and flexible delivery.
                            </p>
                            <p>
                                Our work spans exhibition booths, event environments, interior-focused spaces, graphics,
                                and practical booth extras that help brands show up prepared. The result is a more complete
                                solution for teams that need both visual impact and operational readiness.
                            </p>
                        </div>
                    </div>

                    <div className="company-image-collage">
                        <div className="company-collage-primary">
                            <Image
                                src="/company/events-p17.png"
                                alt="33rd Arab League Summit — Pico Bahrain event delivery"
                                fill
                                sizes="(max-width: 768px) 100vw, 40vw"
                                className="company-media-image company-media-image-poster company-media-image-stage"
                            />
                        </div>
                        <div className="company-collage-secondary">
                            <Image
                                src="/company/cap-av.png"
                                alt="17th Manama Dialogue — Pico Bahrain event setup"
                                fill
                                sizes="(max-width: 768px) 50vw, 18vw"
                                className="company-media-image company-media-image-poster"
                            />
                        </div>
                        <div className="company-collage-secondary">
                            <Image
                                src="/company/cap-events.png"
                                alt="Pico Bahrain interior fit-out — BLINK cafe"
                                fill
                                sizes="(max-width: 768px) 50vw, 18vw"
                                className="company-media-image company-media-image-poster company-media-image-stage"
                            />
                        </div>
                    </div>
                </div>
            </section>

            <section className="section company-section">
                <div className="section-header">
                    <h2>What We Do</h2>
                    <p>Services that help brands create polished, visitor-ready spaces across exhibitions, events, and interiors.</p>
                </div>

                <div className="company-capability-grid">
                    {capabilityCards.map((capability) => (
                        <article key={capability.title} className="company-capability-card">
                            <div className="company-capability-media">
                                <Image
                                    src={capability.image}
                                    alt={capability.title}
                                    fill
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    className="company-media-image company-media-image-poster"
                                />
                            </div>
                            <div className="company-capability-body">
                                <h3>{capability.title}</h3>
                                <p>{capability.description}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="section company-section">
                <div className="section-header">
                    <h2>Portfolio Highlights</h2>
                    <p>Reference material that shows the range of Pico Bahrain work across events, stands, and interiors.</p>
                </div>

                <div className="company-portfolio-grid">
                    {portfolioHighlights.map((portfolio) => (
                        <article key={portfolio.title} className="company-portfolio-card">
                            <div className="company-portfolio-media">
                                <Image
                                    src={portfolio.image}
                                    alt={portfolio.title}
                                    fill
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    className="company-media-image"
                                />
                            </div>
                            <div className="company-portfolio-body">
                                <h3>{portfolio.title}</h3>
                                <p>{portfolio.description}</p>
                                <a
                                    href={portfolio.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                >
                                    {portfolio.linkLabel}
                                </a>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <section className="section company-section">
                <div className="company-proof-panel">
                    <div className="section-header company-section-header company-section-header-left">
                        <h2>Why Work With Us</h2>
                        <p>A practical mix of local delivery, branded-space experience, and readiness for live environments.</p>
                    </div>

                    <div className="company-proof-list">
                        {valuePoints.map((point) => (
                            <div key={point} className="company-proof-item">
                                <span className="company-proof-mark">+</span>
                                <p>{point}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section company-section">
                <div className="company-cta-strip">
                    <div className="company-cta-copy">
                        <span className="hero-badge">Pico Bahrain</span>
                        <h2>Let&apos;s build a more polished exhibition presence.</h2>
                        <p>
                            Whether you need booth extras, supporting furniture, presentation-ready spaces, or a stronger
                            event environment, our catalogue is ready to help you move faster.
                        </p>
                        <div className="company-contact-inline">
                            <a href="tel:+97336357377">+973 3635 7377</a>
                            <a href="mailto:info@picobahrain.com">info@picobahrain.com</a>
                            <a href="https://instagram.com/picobahrain" target="_blank" rel="noopener noreferrer">
                                Instagram
                            </a>
                        </div>
                    </div>
                    <div className="company-cta-actions">
                        <Link href="/catalogue" className="btn btn-primary btn-lg">
                            Browse Our Catalogue
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
