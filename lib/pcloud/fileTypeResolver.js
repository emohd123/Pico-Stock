/**
 * FileTypeResolver — maps file extension to MIME type, media category,
 * and whether content extraction is supported.
 */

const EXTENSION_MAP = {
    // Documents
    pdf:  { mime: 'application/pdf',     category: 'document', extractable: true },
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document', extractable: true },
    doc:  { mime: 'application/msword',  category: 'document', extractable: false },
    xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'document', extractable: true },
    xls:  { mime: 'application/vnd.ms-excel', category: 'document', extractable: false },
    pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'document', extractable: true },
    ppt:  { mime: 'application/vnd.ms-powerpoint', category: 'document', extractable: false },
    txt:  { mime: 'text/plain',          category: 'document', extractable: true },
    csv:  { mime: 'text/csv',            category: 'document', extractable: true },
    rtf:  { mime: 'application/rtf',     category: 'document', extractable: false },
    md:   { mime: 'text/markdown',       category: 'document', extractable: true },
    json: { mime: 'application/json',    category: 'document', extractable: true },

    // Images
    jpg:  { mime: 'image/jpeg',  category: 'image', extractable: true },
    jpeg: { mime: 'image/jpeg',  category: 'image', extractable: true },
    png:  { mime: 'image/png',   category: 'image', extractable: true },
    webp: { mime: 'image/webp',  category: 'image', extractable: true },
    gif:  { mime: 'image/gif',   category: 'image', extractable: false },
    svg:  { mime: 'image/svg+xml', category: 'image', extractable: false },
    bmp:  { mime: 'image/bmp',   category: 'image', extractable: false },
    tiff: { mime: 'image/tiff',  category: 'image', extractable: false },
    tif:  { mime: 'image/tiff',  category: 'image', extractable: false },

    // Audio
    mp3:  { mime: 'audio/mpeg',  category: 'audio', extractable: true },
    wav:  { mime: 'audio/wav',   category: 'audio', extractable: true },
    m4a:  { mime: 'audio/mp4',   category: 'audio', extractable: true },
    ogg:  { mime: 'audio/ogg',   category: 'audio', extractable: false },
    flac: { mime: 'audio/flac',  category: 'audio', extractable: false },

    // Video
    mp4:  { mime: 'video/mp4',   category: 'video', extractable: false },
    mov:  { mime: 'video/quicktime', category: 'video', extractable: false },
    avi:  { mime: 'video/x-msvideo', category: 'video', extractable: false },
    mkv:  { mime: 'video/x-matroska', category: 'video', extractable: false },
    webm: { mime: 'video/webm',  category: 'video', extractable: false },
    vob:  { mime: 'video/dvd',   category: 'video', extractable: false },
    ifo:  { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    bup:  { mime: 'application/octet-stream', category: 'ignored', extractable: false },

    // Archives
    zip:  { mime: 'application/zip', category: 'archive', extractable: false },
    rar:  { mime: 'application/x-rar-compressed', category: 'archive', extractable: false },

    // Design
    psd:  { mime: 'image/vnd.adobe.photoshop', category: 'design', extractable: false },
    ai:   { mime: 'application/illustrator', category: 'design', extractable: false },
    indd: { mime: 'application/x-indesign', category: 'design', extractable: false },
    dwg:  { mime: 'application/acad', category: 'design', extractable: false },

    // Ignored / system
    db:   { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    ini:  { mime: 'text/plain', category: 'ignored', extractable: false },
    ds_store: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    tmp:  { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    temp: { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    dat:  { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    bak:  { mime: 'application/octet-stream', category: 'ignored', extractable: false },
    log:  { mime: 'text/plain', category: 'ignored', extractable: false },
};

const UNKNOWN = { mime: 'application/octet-stream', category: 'unknown', extractable: false };

/**
 * Resolve file type info from an extension string.
 * @param {string} ext — file extension (with or without leading dot)
 * @returns {{ mime: string, category: string, extractable: boolean }}
 */
export function resolveFileType(ext) {
    const clean = (ext || '').replace(/^\./, '').toLowerCase().trim();
    return EXTENSION_MAP[clean] || UNKNOWN;
}

/**
 * Get the category label for display.
 */
export function getCategoryLabel(category) {
    const labels = {
        document: 'Document',
        image: 'Image',
        audio: 'Audio',
        video: 'Video',
        archive: 'Archive',
        design: 'Design',
        ignored: 'Ignored',
        unknown: 'Unknown',
    };
    return labels[category] || 'Unknown';
}
