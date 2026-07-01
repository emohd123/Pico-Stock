// Reference images shown in the selector only (never in the PDF). Files live in
// /public/ministry-items. Add more entries as images become available.
export const ITEM_IMAGES = {
    1: '/ministry-items/item-1.jpg',
    14: '/ministry-items/item-14.jpg',
    20: '/ministry-items/item-20.png',
    25: '/ministry-items/item-25-26.png',
    26: '/ministry-items/item-25-26.png',
    39: '/ministry-items/item-39.jpg',
};

export function itemImage(itemNo) { return ITEM_IMAGES[itemNo] || null; }
