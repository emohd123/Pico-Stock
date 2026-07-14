// Assets and item grouping for the auto-generated Technical Proposal
// presentation (admin-only). Paths are public URLs on this deployment; the
// generator fetches them into data URIs at render time. Structure mirrors the
// approved reference deck.
import { ITEM_IMAGES } from './itemImages';

const P = '/ministry-items/proposal';

// Item-image overrides where the portal catalog image is not the best
// presentation shot. Keyed by real DB item_no.
export const PRESENTATION_ITEM_IMAGES = {
    ...ITEM_IMAGES,
    5: `${P}/armchair.jpg`,        // Delegate Armchairs — real photo
    19: `${P}/monitor-24.png`,     // Display Monitors — plain 24"
    20: `${P}/mics.png`,           // Conference Microphones
    28: `${P}/letterhead-mock.png`,// A4 Letterheads
};

// Fixed slides' artwork.
export const PRESENTATION_ART = {
    cover: `${P}/cover-front.jpg`,     // front event render (portrait crop)
    topview: `${P}/topview.jpg`,       // general layout — top view render
    structure: `${P}/venue-layout.png`,// CAD venue layout floor plan
    backdrop: `${P}/backdrop-photo.jpg`,
    led: `${P}/led26.jpg`,
    mixer: `${P}/mixer.jpg`,
    pax7: '/ministry-items/item-6.jpg',
    pax8: '/ministry-items/head-table/8pax.jpg',
    pax9: '/ministry-items/head-table/9pax.jpg',
    pax10: '/ministry-items/head-table/10pax.jpg',
    logo: '/brand/pico-logo.png',
};

// Overview slide's fixed 6 category summaries (matches the reference).
export const OVERVIEW_CATEGORIES = [
    ['Structures & Staging', 'Main backdrops (banner & backwall), group-photo platform, custom Head Table'],
    ['Furniture', 'Official chairs, delegate armchairs, secretariat tables, side tables for heads & delegates'],
    ['Branding & Décor', 'Platform and table-top flags & poles, floral centrepiece, country name tags, desk pads'],
    ['Audio Visual', 'LED screens, sound system, conference microphones, synchronized display monitors'],
    ['Stationery & Print', 'ID badges, lanyards, letterheads, notebooks, folders, pens, A4 paper'],
    ['Equipment & Services', 'Laptops, color laser printer, photocopiers, event management staff'],
];

// Special-layout slides.
export const HEAD_TABLE_NO = 6;
export const BACKDROP_NOS = [1, 2, 3, 41];        // shown as cards on the backdrop slide
export const LED_NO = 15;                          // dedicated LED slide
export const SOUND_NOS = [16, 17, 18];             // Lighting, Amplifier, Speakers
export const CONFERENCE_NOS = [19, 20, 21];        // Monitors, Mics, Wi-Fi
export const SERVICES_NO = 38;                     // Event Management Staff (dedicated)

// Generic card-grid sections (kicker / title / DB item_no list), in order.
export const CARD_SECTIONS = [
    { kicker: 'Furniture', title: 'Seating', nos: [4, 5] },
    { kicker: 'Furniture', title: 'Tables', nos: [7, 8, 9] },
    { kicker: 'Branding & Décor', title: 'Flags & Flagpoles', nos: [11, 12, 13, 14] },
    { kicker: 'Branding & Décor', title: 'Table Accessories', nos: [10, 24, 25, 26, 33, 34, 39, 40] },
    { kicker: 'Stationery & Print', title: 'Delegate Stationery', nos: [22, 23, 27, 28, 29, 30, 31, 32] },
    { kicker: 'Equipment (Rental)', title: 'IT & Office Equipment', nos: [35, 36, 37] },
];
