// Reference images shown in the selector only (never in the PDF). Files live in
// /public/ministry-items. Add more entries as images become available.
export const ITEM_IMAGES = {
    1: '/ministry-items/item-1.jpg',
    2: '/ministry-items/item-2.png',
    3: '/ministry-items/item-1.jpg', // shared photo (banner + platform)
    4: '/ministry-items/item-4.png',
    5: '/ministry-items/item-5.jpg',
    6: '/ministry-items/item-6.png',
    7: '/ministry-items/item-7.jpg',
    8: '/ministry-items/item-8-9.png', // shared photo (side tables)
    9: '/ministry-items/item-8-9.png',
    10: '/ministry-items/item-10.png',
    11: '/ministry-items/item-11-12.png', // shared photo (platform flagpoles + flags)
    12: '/ministry-items/item-11-12.png',
    13: '/ministry-items/item-14.jpg', // shared photo (table-top flagpoles + flags)
    14: '/ministry-items/item-14.jpg',
    15: '/ministry-items/item-15.png',
    16: '/ministry-items/item-16.jpg',
    17: '/ministry-items/item-17-18.jpg', // shared photo (sound system: amplifier + speakers)
    18: '/ministry-items/item-17-18.jpg',
    19: '/ministry-items/item-39.jpg', // shared photo (display monitors + monitor covers)
    20: '/ministry-items/item-20.png',
    24: '/ministry-items/item-24.png', // shared photo (leather desk pads + table-size desk pads)
    25: '/ministry-items/item-25-26.png',
    26: '/ministry-items/item-25-26.png',
    28: '/ministry-items/item-28.png',
    29: '/ministry-items/item-29.png',
    30: '/ministry-items/item-30.png',
    31: '/ministry-items/item-31.png',
    33: '/ministry-items/item-24.png', // shared photo (desk pads)
    35: '/ministry-items/item-35.png', // converted from laptop.emf
    36: '/ministry-items/item-36.png', // converted from printer.emf
    37: '/ministry-items/item-37.png', // converted from photocopy.emf
    39: '/ministry-items/item-39.jpg',
};

export function itemImage(itemNo) { return ITEM_IMAGES[itemNo] || null; }
