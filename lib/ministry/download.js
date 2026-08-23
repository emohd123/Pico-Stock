// Content-Disposition for a file whose name came from a person.
//
// HTTP headers are ByteStrings: any character above 255 throws when the Response
// is constructed, which is exactly what happened to a note attachment named in
// Arabic — "مسمى الاجتماع…pdf" answered 500 instead of opening. RFC 6266 covers
// this: an ASCII fallback for old clients, plus filename* carrying the real name
// percent-encoded as UTF-8.
export function contentDisposition(name, { inline = false } = {}) {
    const clean = String(name || 'file').replace(/[\r\n"\\]/g, '').trim() || 'file';
    const ascii = clean.replace(/[^\x20-\x7E]/g, '_').replace(/_+/g, '_');
    return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
