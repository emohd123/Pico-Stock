import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Vercel Blob (private) in production; local .localblob fallback when no token.
const LOCAL_DIR = path.join(process.cwd(), '.localblob');
const LOCAL_PREFIX = 'local:';
const EXT_CT = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function hasBlobToken() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN); }

export async function putPrivate(pathname, data, contentType) {
    if (hasBlobToken()) {
        const { put } = await import('@vercel/blob');
        const blob = await put(pathname, Buffer.from(data), { access: 'private', contentType, addRandomSuffix: true });
        return { url: blob.url, pathname: blob.pathname };
    }
    const ext = path.extname(pathname);
    const rel = pathname.replace(ext, '') + '-' + randomBytes(6).toString('hex') + ext;
    const abs = path.join(LOCAL_DIR, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, Buffer.from(data));
    return { url: LOCAL_PREFIX + rel, pathname: rel };
}

export async function getPrivate(url) {
    if (url.startsWith(LOCAL_PREFIX)) {
        const abs = path.join(LOCAL_DIR, url.slice(LOCAL_PREFIX.length));
        try {
            const buf = await fs.readFile(abs);
            const ct = EXT_CT[path.extname(abs).toLowerCase()] || 'application/octet-stream';
            return { body: new Uint8Array(buf), contentType: ct };
        } catch { return null; }
    }
    const { get } = await import('@vercel/blob');
    const result = await get(url, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const buf = new Uint8Array(await new Response(result.stream).arrayBuffer());
    return { body: buf, contentType: result.blob.contentType || 'application/octet-stream' };
}

export async function delPrivate(url) {
    if (url.startsWith(LOCAL_PREFIX)) {
        await fs.rm(path.join(LOCAL_DIR, url.slice(LOCAL_PREFIX.length)), { force: true });
        return;
    }
    const { del } = await import('@vercel/blob');
    await del(url);
}
