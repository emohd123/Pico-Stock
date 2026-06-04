// Lightweight inline line-icon set (vector-only, no emoji — per Pico brand
// guideline "vector-only assets / no emoji as structural icons").
// Stroke uses currentColor so callers control color (brand teal by default).

const PATHS = {
    // category: all / grid
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    // category: furniture (sofa)
    furniture: <><path d="M3 11V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" /><path d="M3 11a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 2-2" /><path d="M5 19v1M19 19v1" /></>,
    // category: TV / LED screen
    screen: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    // category: graphics (image)
    graphics: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    // step: browse (search)
    browse: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    // step/cart
    cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
    // step: confirm (mail)
    mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
    // step: deliver (truck)
    truck: <><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="1.5" /><circle cx="18.5" cy="18.5" r="1.5" /></>,
    // misc: sparkle (badge)
    sparkle: <><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4L12 3z" /></>,
};

export default function Icon({ name, size = 24, className = '', strokeWidth = 1.8, ...rest }) {
    const path = PATHS[name];
    if (!path) return null;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            {...rest}
        >
            {path}
        </svg>
    );
}
