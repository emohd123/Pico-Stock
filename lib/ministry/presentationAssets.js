// Assets and item-image mapping for the auto-generated Technical Proposal
// presentation (admin-only). Paths are public URLs on this deployment; the
// generator fetches them into data URIs at render time.
import { ITEM_IMAGES } from './itemImages';

const P = '/ministry-items/proposal';

// Item-image overrides where the portal's catalog image is not the best
// presentation shot (e.g. real armchair photo, plain 24" monitor).
export const PRESENTATION_ITEM_IMAGES = {
    ...ITEM_IMAGES,
    5: `${P}/armchair.jpg`,
    19: `${P}/monitor-24.png`,
    20: `${P}/mics.png`,
    25: `${P}/letterhead-mock.png`,
};

// Fixed slides' artwork.
export const PRESENTATION_ART = {
    cover: `${P}/cover-10pax.jpg`,
    layout: `${P}/full18.jpg`,
    topview: `${P}/topview.jpg`,
    structure: `${P}/structure-plan.png`,
    backdrop: `${P}/backdrop-photo.jpg`,
    led: `${P}/led26.jpg`,
    mixer: `${P}/mixer.jpg`,
    pax7: '/ministry-items/item-6.jpg',
    pax8: '/ministry-items/head-table/8pax.jpg',
    pax9: '/ministry-items/head-table/9pax.jpg',
    pax10: '/ministry-items/head-table/10pax.jpg',
    logo: '/brand/pico-logo.png',
};

// Category grouping for item-card slides (item_no -> section). Sections render
// in this order; only items present on the quotation appear.
export const SECTIONS = [
    { key: 'structures', title: 'Structures & Staging', nos: [1, 2, 3, 41] },
    { key: 'seating', title: 'Furniture — Seating', nos: [4, 5] },
    { key: 'tables', title: 'Furniture — Tables', nos: [7, 8, 9] },
    { key: 'flags', title: 'Branding — Flags & Flagpoles', nos: [11, 12, 13, 14] },
    { key: 'accessories', title: 'Branding — Table Accessories', nos: [10, 24, 26, 34, 39, 40] },
    { key: 'av', title: 'Audio Visual', nos: [15, 16, 17, 18] },
    { key: 'conference', title: 'Conference Communication System', nos: [19, 20] },
    { key: 'stationery', title: 'Stationery & Print', nos: [22, 23, 27, 25, 28, 29, 30, 31, 32, 33] },
    { key: 'it', title: 'IT & Office Equipment (Rental)', nos: [35, 36, 37] },
    { key: 'services', title: 'Services', nos: [38] },
];
