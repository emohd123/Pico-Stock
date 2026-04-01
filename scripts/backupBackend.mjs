import { promises as fs } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local', override: false });

const cwd = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(cwd, 'backups', `backend-backup-${timestamp}`);
const supabaseDir = path.join(backupRoot, 'supabase');
const tablesDir = path.join(supabaseDir, 'tables');
const storageDir = path.join(supabaseDir, 'storage');
const localDir = path.join(backupRoot, 'local');
const localDataDir = path.join(localDir, 'data');
const localPublicDir = path.join(localDir, 'public');
const metadataDir = path.join(backupRoot, 'metadata');

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const STAND_BUCKET = String(process.env.STAND_DESIGN_STORAGE_BUCKET || 'stand-design-assets').trim();
const KNOWN_TABLES = ['products', 'orders', 'designers', 'stand_designs'];
const KNOWN_BUCKETS = ['product-images', STAND_BUCKET];
const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function copyIfExists(fromPath, toPath) {
    try {
        const stat = await fs.stat(fromPath);
        if (stat.isDirectory()) {
            await ensureDir(toPath);
            const entries = await fs.readdir(fromPath, { withFileTypes: true });
            for (const entry of entries) {
                await copyIfExists(path.join(fromPath, entry.name), path.join(toPath, entry.name));
            }
            return true;
        }
        await ensureDir(path.dirname(toPath));
        await fs.copyFile(fromPath, toPath);
        return true;
    } catch {
        return false;
    }
}

async function withTimeout(promise, label) {
    let timer = null;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function retry(label, task) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            return await task(attempt);
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            }
        }
    }
    throw lastError;
}

async function fetchTable(table) {
    const rows = [];
    let from = 0;
    while (true) {
        const page = await retry(`table ${table} page ${from}`, () => withTimeout(
            supabase
                .from(table)
                .select('*')
                .range(from, from + PAGE_SIZE - 1),
            `table ${table} page ${from}`,
        ));
        if (page.error) throw new Error(page.error.message || `Failed to fetch ${table}`);
        const data = Array.isArray(page.data) ? page.data : [];
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return rows;
}

async function listBuckets() {
    try {
        const result = await retry('bucket list', () => withTimeout(supabase.storage.listBuckets(), 'bucket list'));
        if (result.error) throw new Error(result.error.message || 'Failed to list buckets');
        return Array.isArray(result.data) ? result.data.map((bucket) => bucket.name).filter(Boolean) : [];
    } catch {
        return KNOWN_BUCKETS.filter(Boolean);
    }
}

async function listBucketObjects(bucket, prefix = '') {
    const files = [];
    const queue = [prefix];
    while (queue.length > 0) {
        const currentPrefix = queue.shift();
        const result = await retry(`list ${bucket}/${currentPrefix || '.'}`, () => withTimeout(
            supabase.storage.from(bucket).list(currentPrefix, { limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
            `list ${bucket}/${currentPrefix || '.'}`,
        ));
        if (result.error) throw new Error(result.error.message || `Failed to list ${bucket}/${currentPrefix}`);
        const items = Array.isArray(result.data) ? result.data : [];
        for (const item of items) {
            const itemPath = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;
            if (item.id === null) {
                queue.push(itemPath);
            } else {
                files.push(itemPath);
            }
        }
    }
    return files;
}

async function downloadBucketObject(bucket, objectPath) {
    const result = await retry(`download ${bucket}/${objectPath}`, () => withTimeout(
        supabase.storage.from(bucket).download(objectPath),
        `download ${bucket}/${objectPath}`,
    ));
    if (result.error) throw new Error(result.error.message || `Failed to download ${bucket}/${objectPath}`);
    const arrayBuffer = await result.data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function backupSupabaseTables(manifest) {
    if (!supabase) {
        manifest.supabase.available = false;
        manifest.supabase.error = 'Supabase environment variables are not configured locally.';
        return;
    }

    for (const table of KNOWN_TABLES) {
        try {
            const rows = await fetchTable(table);
            await writeJson(path.join(tablesDir, `${table}.json`), rows);
            manifest.supabase.tables[table] = { ok: true, rows: rows.length };
        } catch (error) {
            manifest.supabase.tables[table] = { ok: false, error: error.message };
        }
    }
}

async function backupSupabaseStorage(manifest) {
    if (!supabase) return;

    const buckets = await listBuckets();
    manifest.supabase.buckets.list = buckets;
    for (const bucket of buckets) {
        try {
            const files = await listBucketObjects(bucket);
            manifest.supabase.buckets.items[bucket] = { ok: true, files: files.length };
            for (const objectPath of files) {
                try {
                    const data = await downloadBucketObject(bucket, objectPath);
                    const outPath = path.join(storageDir, bucket, ...objectPath.split('/'));
                    await ensureDir(path.dirname(outPath));
                    await fs.writeFile(outPath, data);
                } catch (error) {
                    if (!manifest.supabase.buckets.items[bucket].errors) {
                        manifest.supabase.buckets.items[bucket].errors = [];
                    }
                    manifest.supabase.buckets.items[bucket].errors.push({ path: objectPath, error: error.message });
                }
            }
        } catch (error) {
            manifest.supabase.buckets.items[bucket] = { ok: false, error: error.message };
        }
    }
}

async function backupLocalArtifacts(manifest) {
    const localCopies = [
        { from: path.join(cwd, 'data'), to: localDataDir, key: 'data' },
        { from: path.join(cwd, 'public', 'uploads'), to: path.join(localPublicDir, 'uploads'), key: 'uploads' },
        { from: path.join(cwd, 'public', 'products'), to: path.join(localPublicDir, 'products'), key: 'products_public' },
        { from: path.join(cwd, 'supabase', 'schema.sql'), to: path.join(metadataDir, 'schema.sql'), key: 'schema_sql' },
        { from: path.join(cwd, '.env.local'), to: path.join(metadataDir, '.env.local'), key: 'env_local' },
        { from: path.join(cwd, '.env.production.local'), to: path.join(metadataDir, '.env.production.local'), key: 'env_production_local' },
    ];

    for (const item of localCopies) {
        const copied = await copyIfExists(item.from, item.to);
        manifest.local[item.key] = copied;
    }
}

async function main() {
    await ensureDir(backupRoot);
    const manifest = {
        created_at: new Date().toISOString(),
        source_project: {
            cwd,
            supabase_url: SUPABASE_URL,
        },
        supabase: {
            available: true,
            tables: {},
            buckets: {
                list: [],
                items: {},
            },
        },
        local: {},
    };

    console.log(`Creating backup in: ${backupRoot}`);
    await backupLocalArtifacts(manifest);
    await backupSupabaseTables(manifest);
    await backupSupabaseStorage(manifest);
    await writeJson(path.join(backupRoot, 'manifest.json'), manifest);

    console.log('\nBackup complete.');
    console.log(`Manifest: ${path.join(backupRoot, 'manifest.json')}`);
    console.log('Table results:');
    for (const [table, info] of Object.entries(manifest.supabase.tables)) {
        console.log(`- ${table}: ${info.ok ? `${info.rows} rows` : `FAILED (${info.error})`}`);
    }
    console.log('Bucket results:');
    for (const [bucket, info] of Object.entries(manifest.supabase.buckets.items)) {
        console.log(`- ${bucket}: ${info.ok ? `${info.files} files` : `FAILED (${info.error})`}`);
    }
}

main().catch((error) => {
    console.error('Backup failed:', error);
    process.exitCode = 1;
});
