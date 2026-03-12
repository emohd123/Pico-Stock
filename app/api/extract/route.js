import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Dynamic imports to avoid Next.js bundling issues
async function getJSZip() {
    const mod = await import('jszip');
    return mod.default || mod;
}

async function getPDFParse() {
    const mod = await import('pdf-parse');
    return mod.PDFParse || mod.default?.PDFParse || mod.default || mod;
}

const EXTRACTED_DIR = path.join(process.cwd(), 'public', 'products', 'extracted');

async function ensureDir() {
    try {
        await fs.access(EXTRACTED_DIR);
    } catch {
        await fs.mkdir(EXTRACTED_DIR, { recursive: true });
    }
}

export async function POST(request) {
    try {
        await ensureDir();
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const filename = file.name.toLowerCase();
        const ext = filename.split('.').pop();

        let products = [];

        // Excel / CSV extraction
        if (['xlsx', 'xls', 'csv'].includes(ext)) {
            products = parseSpreadsheet(buffer);
        }
        // JSON file
        else if (ext === 'json') {
            try {
                const text = new TextDecoder().decode(buffer);
                const data = JSON.parse(text);
                products = Array.isArray(data) ? data.map(normalizeProduct) : [normalizeProduct(data)];
            } catch {
                return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
            }
        }
        // Text / TSV
        else if (['txt', 'tsv'].includes(ext)) {
            products = parseTextFile(buffer);
        }
        // PDF / BDF - use pdf-parse for real text extraction
        else if (['pdf', 'bdf'].includes(ext)) {
            products = await parsePDF(buffer, filename);
        }
        // PowerPoint - unzip and parse XML slides
        else if (['ppt', 'pptx'].includes(ext)) {
            products = await parsePowerPoint(buffer, filename);
        }
        // Word documents
        else if (['doc', 'docx'].includes(ext)) {
            products = await parseDocx(buffer, filename);
        }
        // Image files
        else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
            const imgExt = ext;
            const imgName = `${uuidv4()}.${imgExt}`;
            await fs.writeFile(path.join(EXTRACTED_DIR, imgName), buffer);

            products = [{
                name: filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
                description: `Imported from image: ${file.name}`,
                category: 'graphics',
                price: 0,
                image: `/products/extracted/${imgName}`,
                inStock: true,
                featured: false,
                _needsReview: true,
            }];
        }
        else {
            return NextResponse.json({
                error: `Unsupported file type: .${ext}. Supported: xlsx, xls, csv, json, txt, pdf, bdf, ppt, pptx, doc, docx, images`
            }, { status: 400 });
        }

        // Filter out empty products and normalize extracted metadata for review/import.
        products = products
            .filter(p => p.name && p.name.trim())
            .map(normalizeExtractedProduct);

        return NextResponse.json({
            success: true,
            filename: file.name,
            fileType: ext,
            products,
            count: products.length,
            message: `Extracted ${products.length} product(s) from ${file.name}`,
        });

    } catch (error) {
        console.error('Extract error:', error);
        return NextResponse.json({ error: 'Failed to extract data from file: ' + error.message }, { status: 500 });
    }
}

// ─── PDF / BDF Parser ────────────────────────────────────────
async function parsePDF(buffer, filename) {
    let parser = null;
    try {
        const PDFParse = await getPDFParse();
        parser = new PDFParse({ data: buffer });

        const [textResult, tableResult] = await Promise.allSettled([
            parser.getText(),
            parser.getTable(),
        ]);

        const pagesText = textResult.status === 'fulfilled'
            ? textResult.value.pages.map(page => page.text).join('\n')
            : '';

        const tableText = tableResult.status === 'fulfilled'
            ? tableResult.value.pages
                .flatMap(page => page.tables || [])
                .flatMap(table => table.map(row => row.join(' | ')))
                .join('\n')
            : '';

        const combinedText = [pagesText, tableText].filter(Boolean).join('\n');
        const products = extractProductsFromText(combinedText, filename, 'pdf');
        return products;
    } catch (err) {
        console.error('PDF parse error:', err);
        return [{
            name: `Product from ${filename}`,
            description: `Could not fully parse PDF. Please edit details manually.`,
            category: 'furniture',
            price: 0,
            image: '/products/table.svg',
            inStock: true,
            featured: false,
            _needsReview: true,
        }];
    } finally {
        if (parser && typeof parser.destroy === 'function') {
            try { await parser.destroy(); } catch {}
        }
    }
}

// ─── PowerPoint Parser ───────────────────────────────────────
async function parsePowerPoint(buffer, filename) {
    try {
        const JSZip = await getJSZip();
        const zip = await JSZip.loadAsync(buffer);

        // 1. Map all media
        const mediaMap = {};
        const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('ppt/media/'));
        for (const f of mediaFiles) {
            const data = await zip.files[f].async('nodebuffer');
            const ext = path.extname(f).slice(1) || 'png';
            const imgName = `${uuidv4()}.${ext}`;
            await fs.writeFile(path.join(EXTRACTED_DIR, imgName), data);
            mediaMap[f] = `/products/extracted/${imgName}`;
        }

        const slideFiles = Object.keys(zip.files)
            .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/i))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });

        // First Pass: Build Rate Registry (ID -> Price mapping)
        let allTextForRegistry = "";
        for (const slideFile of slideFiles) {
            const xml = await zip.files[slideFile].async('text');
            const textMatches = xml.matchAll(/<a:t>([^<]*)<\/a:t>/g);
            allTextForRegistry += Array.from(textMatches).map(m => m[1].trim()).filter(t => t).join(' ') + '\n';
        }
        const rateRegistry = buildRateRegistry(allTextForRegistry);

        const slideData = [];
        // Second Pass: Extract Products and Images
        for (const slideFile of slideFiles) {
            const slideNum = slideFile.match(/\d+/)[0];
            const xml = await zip.files[slideFile].async('text');
            const relsFile = `ppt/slides/_rels/slide${slideNum}.xml.rels`;

            const slideImages = [];
            if (zip.files[relsFile]) {
                const relsXml = await zip.files[relsFile].async('text');
                const relMatches = relsXml.matchAll(/Id="([^"]+)"\s+Type="[^"]+image"\s+Target="\.\.\/media\/([^"]+)"/g);
                for (const match of relMatches) {
                    const rId = match[1];
                    const target = match[2];
                    if (mediaMap[`ppt/media/${target}`]) {
                        slideImages.push({ rId, url: mediaMap[`ppt/media/${target}`] });
                    }
                }
            }

            // More robust text extraction: find all <a:t> within <p:sp>
            const slideProducts = [];
            // Regex to find shape blocks
            const shapeMatches = xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g);
            let currentTitle = '';
            let currentPrice = 0;
            let currentDescription = '';

            for (const shapeMatch of shapeMatches) {
                const shapeXml = shapeMatch[1];
                const textMatches = shapeXml.matchAll(/<a:t>([^<]*)<\/a:t>/g);
                const texts = Array.from(textMatches).map(m => m[1].trim()).filter(t => t);
                const fullShapeText = texts.join(' ');

                if (!fullShapeText) continue;
                
                // Ignore general slide titles and navigation text
                if (fullShapeText.match(/^(Rental Catalogue|Catalogue|Page|Slide|\d+)$/i)) continue;
                if (fullShapeText.length < 2) continue;

                // Check for ID codes like ID 1534 or just 1534
                const idRegex = /\b(\d{4,5})\b/;
                const idMatch = fullShapeText.match(/ID\s*(\d+)/i) || (fullShapeText.length < 10 && fullShapeText.match(idRegex));
                
                // Check for prices
                const priceRegex = /(\d+(?:\.\d{1,2})?)\s*(?:BHD|BD|USD|\$)/i;
                const priceMatch = fullShapeText.match(priceRegex);

                if (idMatch || priceMatch) {
                    if (currentTitle && currentTitle.length > 3) {
                        // Filter out generic headers that don't look like products
                        const isHeader = currentTitle.match(/^[A-Z\s]+$/) && currentTitle.length < 20;
                        if (!isHeader || currentPrice > 0) {
                            slideProducts.push(buildExtractedProduct({
                                rawName: currentTitle,
                                fallbackDescription: currentDescription || `From Slide ${slideNum}`,
                                price: currentPrice || (currentTitle.match(idRegex) ? rateRegistry[currentTitle.match(idRegex)[1]] : 0) || 0,
                                category: guessCategory(currentTitle + ' ' + currentDescription)
                            }));
                        }
                    }
                    currentTitle = fullShapeText;
                    currentPrice = priceMatch ? parseFloat(priceMatch[1]) : 0;
                    
                    if (!currentPrice && currentTitle.match(idRegex)) {
                        currentPrice = rateRegistry[currentTitle.match(idRegex)[1]] || 0;
                    }
                    
                    currentDescription = '';
                } else if (currentTitle) {
                    currentDescription += (currentDescription ? ' ' : '') + fullShapeText;
                } else if (fullShapeText.length > 5) {
                    currentTitle = fullShapeText;
                }
            }

            // Push last one
            if (currentTitle) {
                const idRegex = /\b(\d{4,5})\b/;
                slideProducts.push(buildExtractedProduct({
                    rawName: currentTitle,
                    fallbackDescription: currentDescription || `From Slide ${slideNum}`,
                    price: currentPrice || (currentTitle.match(idRegex) ? rateRegistry[currentTitle.match(idRegex)[1]] : 0) || 0,
                    category: guessCategory(currentTitle + ' ' + currentDescription)
                }));
            }

            // ── Parse PowerPoint tables (<p:graphicFrame> / <a:tbl>) ──────────────────
            // RATES slides use actual table elements, not text shapes.
            const graphicFrameMatches = xml.matchAll(/<p:graphicFrame\b[^>]*>([\s\S]*?)<\/p:graphicFrame>/g);
            for (const frameMatch of graphicFrameMatches) {
                const frameXml = frameMatch[1];
                if (!frameXml.includes('<a:tbl>')) continue;

                // Collect all rows
                const tableRows = [];
                for (const rowMatch of frameXml.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
                    const cells = [];
                    for (const cellMatch of rowMatch[1].matchAll(/<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g)) {
                        const cellText = Array.from(cellMatch[1].matchAll(/<a:t>([^<]*)<\/a:t>/g))
                            .map(m => m[1].trim()).filter(Boolean).join(' ');
                        cells.push(cellText);
                    }
                    if (cells.some(c => c)) tableRows.push(cells);
                }
                if (tableRows.length < 2) continue;

                // Identify columns from header row
                const hdr = tableRows[0].map(h => String(h).toLowerCase().trim());
                const colIdx = {
                    id:     hdr.findIndex(h => h === 'id no' || h === 'id' || h === 'no' || h === '#'),
                    code:   hdr.findIndex(h => h.includes('code') || h.includes('sku')),
                    stock:  hdr.findIndex(h => h.includes('stock') || h.includes('qty') || h.includes('quantity')),
                    rate:   hdr.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('bhd')),
                    colour: hdr.findIndex(h => h.includes('colour') || h.includes('color')),
                    dims:   hdr.findIndex(h => h.includes('dim') || h.includes('size')),
                    name:   hdr.findIndex(h => h.includes('name') || h.includes('description') || h.includes('type') || h.includes('product')),
                };

                for (const row of tableRows.slice(1)) {
                    const get = (i) => (i >= 0 && i < row.length ? row[i] : '');
                    const idNo     = get(colIdx.id);
                    const code     = get(colIdx.code);
                    const stockQty = get(colIdx.stock);
                    const unitRate = get(colIdx.rate);
                    const colour   = get(colIdx.colour);
                    const dims     = get(colIdx.dims);
                    const nameField= get(colIdx.name) || row.find(c => c && c.length > 3) || '';

                    if (!idNo && !code && !nameField) continue;

                    // Build OSFam-compatible raw name
                    const stockPart  = stockQty ? ` [${stockQty}]` : '';
                    const dimsPart   = dims     ? ` ${buildDimsPart(dims)}` : '';
                    const colourPart = colour   ? ` ${colour}` : '';
                    let rawName = '';
                    if (idNo && code) {
                        rawName = `ID ${idNo} ${code}${stockPart} ${nameField}${colourPart}${dimsPart}`.trim();
                    } else if (idNo) {
                        rawName = `ID ${idNo}${stockPart} ${nameField}${colourPart}${dimsPart}`.trim();
                    } else {
                        rawName = nameField || code;
                    }

                    const price = parseFloat(String(unitRate).replace(/[^0-9.]/g, '')) || rateRegistry[idNo] || 0;
                    const cat   = guessCategory(nameField + ' ' + code);

                    const product = buildExtractedProduct({
                        rawName: rawName || nameField || 'Unknown',
                        fallbackDescription: nameField,
                        category: cat,
                        price,
                        image: slideImages[0]?.url || getCategoryImage(cat),
                        inStock: true,
                        stockQty: String(stockQty || ''),
                        featured: false,
                        needsReview: !price,
                    });

                    const stockNum = stockQty !== '' ? parseInt(String(stockQty).replace(/[^0-9]/g, ''), 10) : null;
                    product._stockNum = isNaN(stockNum) ? null : stockNum;
                    slideProducts.push(product);
                }
            }
            // ──────────────────────────────────────────────────────────────────────────

            // Assign slide images to these products
            slideProducts.forEach((p, idx) => {
                p.image = slideImages[idx]?.url || slideImages[0]?.url || '/products/table.svg';
                p.inStock = true;
                p.featured = false;
                p._needsReview = p.price === 0;
            });

            slideData.push(...slideProducts);
        }

        return slideData.length > 0 ? slideData : [{
            name: `Product from ${filename}`,
            description: `PowerPoint file uploaded. Please edit details manually.`,
            category: 'furniture',
            price: 0,
            image: '/products/table.svg',
            inStock: true,
            featured: false,
            _needsReview: true,
        }];
    } catch (err) {
        console.error('PPTX parse error:', err);
        return [{
            name: `Product from ${filename}`,
            description: `Could not fully parse PowerPoint.`,
            category: 'furniture',
            price: 0,
            image: '/products/table.svg',
            inStock: true,
            featured: false,
            _needsReview: true,
        }];
    }
}

// ─── DOCX Parser ─────────────────────────────────────────────
async function parseDocx(buffer, filename) {
    try {
        const JSZip = await getJSZip();
        const zip = await JSZip.loadAsync(buffer);
        const docXml = await zip.files['word/document.xml']?.async('text');
        if (!docXml) throw new Error('No document.xml found');

        // Extract text from <w:t> tags
        const textMatches = docXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const allText = textMatches.map(m => m.replace(/<\/?w:t[^>]*>/g, '').trim()).filter(t => t).join('\n');

        return extractProductsFromText(allText, filename, 'docx');
    } catch (err) {
        console.error('DOCX parse error:', err);
        return [{
            name: `Product from ${filename}`,
            description: `Could not parse Word document. Please edit details manually.`,
            category: 'furniture',
            price: 0,
            image: '/products/table.svg',
            inStock: true,
            featured: false,
            _needsReview: true,
        }];
    }
}

// ─── Smart Text → Product Extraction ─────────────────────────
function extractProductsFromText(text, filename, sourceType) {
    const products = [];
    const rateTableProducts = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rateRegistry = buildRateRegistryFromLines(lines);

    // Strategy 1: Look for tabular data (lines with prices)
    const priceRegex = /(?:^|[\s:|-])(\d+(?:\.\d{1,3})?)\s*(?:BHD|bhd|BD|bd|USD|usd|\$|\/day|\/unit|per\s+day|per\s+unit)\b/i;
    const currencyRegex = /(?:BHD|BD|USD|\$)\s*(\d+(?:\.\d{1,2})?)/;

    // Try to find slide-based products (for PPTX)
    if (text.includes('---SLIDE---')) {
        const slides = text.split('---SLIDE---').filter(s => s.trim());
        for (const slide of slides) {
            const slideLines = slide.split('\n').map(l => l.trim()).filter(l => l.length > 1);
            if (slideLines.length === 0) continue;

            let title = '';
            let description = '';
            let price = 0;

            for (const line of slideLines) {
                const priceMatch = line.match(currencyRegex) || line.match(priceRegex);
                if (priceMatch) {
                    price = parseFloat(priceMatch[1]) || 0;
                    continue;
                }

                if (!title && line.length > 2 && line.length < 100) {
                    title = line;
                } else if (title && !description && line.length > 5) {
                    description = line;
                }
            }

            if (title && !title.match(/^(click|slide|page|\d+$)/i)) {
                products.push(buildExtractedProduct({
                    rawName: title,
                    fallbackDescription: description || `From ${sourceType.toUpperCase()}: ${filename}`,
                    category: guessCategory(title + ' ' + description),
                    price,
                    image: getCategoryImage(guessCategory(title + ' ' + description)),
                    needsReview: price === 0,
                }));
            }
        }
    }

    // Strategy 2: Line-by-line extraction for PDFs/other docs
    if (products.length === 0) {
        let currentProduct = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.length < 3 || line.match(/^(page|slide|\d+|---page.*---)$/i)) continue;

            if (looksLikeStructuredProductLine(line)) {
                const fields = extractStructuredFields(line);
                const fallbackRate = firstValue(fields.idNo?.split(' / ').map(id => rateRegistry[id])) || inferTrailingRate(line);
                const structuredProduct = buildExtractedProduct({
                    rawName: line,
                    fallbackDescription: `Extracted from ${sourceType.toUpperCase()} file`,
                    category: guessCategory(line),
                    price: fallbackRate || 0,
                    image: getCategoryImage(guessCategory(line)),
                    productType: fields.type,
                    stockQty: fields.stockQty,
                    inStock: true,
                    featured: false,
                    needsReview: !fallbackRate,
                });

                if (isRateTableLine(line)) {
                    rateTableProducts.push(structuredProduct);
                } else {
                    products.push(structuredProduct);
                }
                currentProduct = null;
                continue;
            }

            const priceMatch = line.match(currencyRegex) || line.match(priceRegex);

            if (priceMatch) {
                const price = parseFloat(priceMatch[1]) || 0;
                const nameBeforePrice = line.replace(priceMatch[0], '').replace(/[-–—|:,]/g, '').trim();

                if (nameBeforePrice.length > 3) {
                    products.push(buildExtractedProduct({
                        rawName: nameBeforePrice,
                        fallbackDescription: `Extracted from ${sourceType.toUpperCase()} file`,
                        category: guessCategory(nameBeforePrice),
                        price,
                        image: getCategoryImage(guessCategory(nameBeforePrice)),
                        needsReview: false,
                    }));
                    currentProduct = null;
                } else if (currentProduct) {
                    currentProduct.price = price;
                    currentProduct._needsReview = false;
                    products.push(currentProduct);
                    currentProduct = null;
                }
            } else if (line.length > 3 && line.length < 80 && !line.match(/^\d+$/)) {
                if (currentProduct && currentProduct.price === 0) {
                    products.push(currentProduct);
                }
                currentProduct = buildExtractedProduct({
                    rawName: line,
                    fallbackDescription: `Extracted from ${sourceType.toUpperCase()} file`,
                    category: guessCategory(line),
                    price: 0,
                    image: getCategoryImage(guessCategory(line)),
                    needsReview: true,
                });
            }
        }

        if (currentProduct) {
            products.push(currentProduct);
        }
    }

    const seen = new Set();
    const mergedProducts = mergeRateTableProducts(products, rateTableProducts);
    const deduped = mergedProducts.filter(p => {
        const key = `${p.idNo || ''}|${p.code || ''}|${p.name.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (deduped.length === 0) {
        return [{
            name: `Product from ${filename}`,
            description: `Imported from ${sourceType.toUpperCase()} file. Edit product details.`,
            category: 'furniture',
            price: 0,
            image: '/products/table.svg',
            inStock: true,
            featured: false,
            _needsReview: true,
        }];
    }

    return deduped;
}

// ─── Spreadsheet Parser ──────────────────────────────────────
function parseSpreadsheet(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rawData.length === 0) return [];

    // Detect if this is a Pico-style catalogue spreadsheet by looking for known
    // catalogue column headers: ID NO / CODE / STOCK QTY / UNIT RATE / COLOUR
    const firstRow = rawData[0];
    const headerKeys = Object.keys(firstRow).map(k => String(k).toLowerCase().trim());
    const hasCatalogueHeaders = (
        headerKeys.some(k => k === 'id no' || k === 'id no.' || k === 'id' || k.startsWith('cat') || k === 'no') &&
        headerKeys.some(k => k.includes('code') || k.includes('stock qty') || k.includes('unit rate'))
    );

    return rawData.map(row => {
        if (hasCatalogueHeaders) {
            // ── Pico Catalogue Format ────────────────────────────────
            const idNo     = findValue(row, ['id no', 'id no.', 'id #', 'catalog id', 'cat. id', 'cat id', 'id', 'no', '#']);
            const code     = findValue(row, ['code', 'product code', 'item code', 'sku']);
            const stockQty = findValue(row, ['stock qty', 'stock quantity', 'stock', 'qty', 'quantity', 'available']);
            const unitRate = findValue(row, ['unit rate', 'unit rate (bhd)', 'rate (bhd)', 'rate', 'price', 'price (bhd)', 'rental rate', 'daily rate', 'cost']);
            const colour   = findValue(row, ['colour', 'color', 'finish', 'shade']);
            const dims     = findValue(row, ['dimensions', 'dimensions (cm)', 'dimensions(cm)', 'dims', 'size', 'h x d x w', 'hxdxw', 'dim']);
            const typeOrName = findValue(row, ['type', 'product type', 'item type', 'name', 'product name', 'product', 'description', 'item', 'title']);
            const category = findValue(row, ['category', 'cat', 'section', 'group', 'product category']);
            const image    = findValue(row, ['image', 'picture', 'photo', 'img', 'image url', 'pic']);

            // Build OSFam-compatible raw name so nameHelpers.js can extract all specs later.
            // Format: "ID {idNo} {code} [{stockQty}] {typeOrName} {colour} H{dims}cm"
            const stockPart  = stockQty ? ` [${stockQty}]` : '';
            const dimsPart   = dims     ? ` ${buildDimsPart(dims)}` : '';
            const colourPart = colour   ? ` ${colour}` : '';
            let rawName = '';
            if (idNo && code) {
                rawName = `ID ${idNo} ${code}${stockPart} ${typeOrName}${colourPart}${dimsPart}`.trim();
            } else if (idNo) {
                rawName = `ID ${idNo}${stockPart} ${typeOrName}${colourPart}${dimsPart}`.trim();
            } else {
                rawName = typeOrName || code || '';
            }

            const normalizedCat = normalizeCategory(String(category || typeOrName || 'furniture'));
            const price = parseFloat(String(unitRate).replace(/[^0-9.]/g, '')) || 0;
            const stockNum = stockQty !== '' ? parseInt(String(stockQty).replace(/[^0-9]/g, ''), 10) : null;

            const product = buildExtractedProduct({
                rawName: rawName || typeOrName || 'Unknown',
                fallbackDescription: typeOrName && rawName !== typeOrName ? typeOrName : '',
                category: normalizedCat,
                price,
                image: image || getCategoryImage(normalizedCat),
                inStock: stockNum !== null ? stockNum > 0 : true,
                stockQty: String(stockQty || ''),
                featured: false,
                productType: typeOrName || '',
                needsReview: !idNo && !typeOrName,
            });

            // Store numeric stock for clean DB import
            product._stockNum = isNaN(stockNum) ? null : stockNum;
            return product;
        }

        // ── Standard / Generic Format ────────────────────────────────
        const name       = findValue(row, ['name', 'product', 'product name', 'item', 'title', 'product_name']);
        const description= findValue(row, ['description', 'desc', 'details', 'product description', 'info', 'notes']);
        const category   = findValue(row, ['category', 'cat', 'group', 'product category', 'section', 'type']);
        const price      = findValue(row, ['price', 'cost', 'rate', 'amount', 'unit price', 'unit_price', 'rental price', 'unit rate', 'daily rate', 'bhd']);
        const stock      = findValue(row, ['stock', 'in stock', 'in_stock', 'available', 'qty', 'quantity', 'stock qty']);
        const featured   = findValue(row, ['featured', 'highlight', 'popular']);

        // Smart: read supplementary structured columns that may exist even without
        // full Pico catalogue headers — merge them into rawName so extractStructuredFields
        // can parse ID, CODE, COLOUR, DIMENSIONS into their proper fields.
        const extraId     = findValue(row, ['id', 'id no', 'id no.', 'product id', 'item id', 'item no', 'item no.', 'no', '#']);
        const extraCode   = findValue(row, ['code', 'product code', 'item code', 'sku']);
        const extraColour = findValue(row, ['colour', 'color', 'colour / finish', 'finish', 'shade']);
        const extraDims   = findValue(row, ['dimensions', 'dimensions (cm)', 'dimensions(cm)', 'dims', 'size', 'h x d x w', 'hxdxw']);

        const firstKey = Object.keys(row)[0];
        let productName = String(name || (firstKey ? row[firstKey] : '') || '').trim();

        // Skip rows whose "name" cell looks like a leaked column-header row
        if (/^(?:DIMENSIONS?\s*(?:\(cm\))?|TYPE|CODE|COLOUR|COLOR|ID\s*NO\.?|STOCK|UNIT\s*RATE|CATEGORY|PRODUCT\s*NAME|ITEM\s*NAME)\s*$/i.test(productName)) {
            return null;
        }

        // Build enriched rawName when extra structured columns found
        const idStr     = String(extraId || '').trim();
        const codeStr   = String(extraCode || '').trim().toUpperCase();
        const colourStr = String(extraColour || '').trim();
        const dimsStr   = String(extraDims || '').trim();

        const alreadyHasId     = idStr     && productName.includes(idStr);
        const alreadyHasCode   = codeStr   && productName.includes(codeStr);
        const alreadyHasColour = colourStr && productName.toLowerCase().includes(colourStr.toLowerCase());
        const alreadyHasDims   = dimsStr   && productName.replace(/\s/g, '').includes(dimsStr.replace(/\s/g, ''));

        const enrichedParts = [];
        if (!alreadyHasId && idStr && /^\d{3,6}$/.test(idStr)) {
            if (!alreadyHasCode && codeStr && /^[A-Z][A-Z0-9]{2,}$/.test(codeStr)) {
                enrichedParts.push(`ID ${idStr} ${codeStr}`);
            } else {
                enrichedParts.push(`ID ${idStr}`);
            }
        } else if (!alreadyHasCode && codeStr && /^[A-Z][A-Z0-9]{2,}$/.test(codeStr)) {
            enrichedParts.push(codeStr);
        }
        enrichedParts.push(productName);
        if (!alreadyHasColour && colourStr) enrichedParts.push(colourStr);
        if (!alreadyHasDims  && dimsStr)   enrichedParts.push(buildDimsPart(dimsStr));
        if (enrichedParts.length > 1) productName = enrichedParts.filter(Boolean).join(' ');

        const stockNum = stock !== '' ? parseInt(String(stock).replace(/[^0-9]/g, ''), 10) : null;
        const normalizedCat = normalizeCategory(String(category || 'furniture'));

        const product = buildExtractedProduct({
            rawName: productName,
            fallbackDescription: String(description || '').trim(),
            category: normalizedCat,
            price: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0,
            image: getCategoryImage(normalizedCat),
            inStock: stockNum !== null ? stockNum > 0 : true,
            stockQty: String(stock || ''),
            featured: !!featured,
            needsReview: !name || !price,
        });

        // Store numeric stock for clean DB import (consistent with Pico catalogue path)
        product._stockNum = isNaN(stockNum) ? null : stockNum;
        return product;
    }).filter(Boolean).filter(p => p.name);
}

/** Convert a raw dimension string into the OSFam HxDxW format */
function buildDimsPart(dims) {
    const s = String(dims).replace(/\s+/g, '').replace(/[*×x]/gi, 'x').toUpperCase();
    if (/^H\d/.test(s)) {
        return s.endsWith('CM') ? s.slice(0, -2) + 'cm' : (s.endsWith('cm') ? s : s + 'cm');
    }
    const parts = s.split('X').filter(p => /^\d/.test(p));
    if (parts.length === 3) return `H${parts[0]}xD${parts[1]}xW${parts[2]}cm`;
    return s;
}

// ─── Text File Parser ────────────────────────────────────────
function parseTextFile(buffer) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return [];

    const firstLine = lines[0];
    let delimiter = '\t';
    if (firstLine.includes(',')) delimiter = ',';
    if (firstLine.includes('|')) delimiter = '|';

    const headers = firstLine.toLowerCase();
    const hasHeader = headers.includes('name') || headers.includes('product') || headers.includes('price');

    // Free-form text exports (catalog snippets, copied PDF text, spec lists) do better
    // with the smart extractor than the delimiter-based row parser.
    if (!hasHeader) {
        const looksStructuredText = lines.some(line => looksLikeStructuredProductLine(line) || /\bID\s*\d{4,5}\b/i.test(line));
        const allSingleColumn = lines.every(line => line.split(delimiter).length <= 1);
        if (looksStructuredText || allSingleColumn) {
            return extractProductsFromText(text, 'uploaded.txt', 'txt');
        }
    }

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const headerParts = hasHeader ? firstLine.split(delimiter).map(h => h.trim().toLowerCase()) : [];

    return dataLines.map(line => {
        const parts = line.split(delimiter).map(p => p.trim());
        if (headerParts.length > 0) {
            const row = {};
            headerParts.forEach((h, i) => { row[h] = parts[i] || ''; });
            return normalizeProduct(row);
        }
        return buildExtractedProduct({
            rawName: parts[0] || '',
            fallbackDescription: parts[1] || '',
            category: normalizeCategory(parts[2] || 'furniture'),
            price: parseFloat(parts[3]) || 0,
            image: getCategoryImage(normalizeCategory(parts[2] || 'furniture')),
            inStock: true,
            featured: false,
            needsReview: true,
        });
    });
}

// ─── Helpers ─────────────────────────────────────────────────
function normalizeProduct(row) {
    const name = row.name || row.product || row.title || row.item || '';
    const desc = row.description || row.desc || row.details || '';
    const cat = row.category || row.type || row.group || 'furniture';
    const price = row.price || row.cost || row.rate || 0;

    return buildExtractedProduct({
        rawName: String(name).trim(),
        fallbackDescription: String(desc).trim(),
        category: normalizeCategory(String(cat)),
        price: parseFloat(price) || 0,
        image: row.image || getCategoryImage(normalizeCategory(String(cat))),
        inStock: row.inStock !== false && row.in_stock !== false,
        stockQty: row.stockQty || row.stock || row.quantity || row.qty || '',
        featured: !!row.featured,
        needsReview: !name || !price,
    });
}

function normalizeCategory(cat) {
    const c = String(cat).toLowerCase().trim();
    if (c.includes('tv') || c.includes('led') || c.includes('screen') || c.includes('display') || c.includes('monitor') || c.includes('video')) return 'tv-led';
    if (c.includes('graphic') || c.includes('banner') || c.includes('print') || c.includes('sign') || c.includes('vinyl') || c.includes('backdrop')) return 'graphics';
    if (['furniture', 'tv-led', 'graphics'].includes(c)) return c;
    return 'furniture';
}

function guessCategory(text) {
    const t = text.toLowerCase();
    if (t.match(/tv|led|screen|display|monitor|video|kiosk|projector|4k|qled/)) return 'tv-led';
    if (t.match(/banner|graphic|print|sign|vinyl|backdrop|flag|fascia|roll.?up|poster|branding|sticker/)) return 'graphics';
    if (t.match(/chair|stool|sofa|table|desk|bench|seating|armchair|beanbag|counter/)) return 'furniture';
    return 'furniture';
}

function getCategoryImage(category) {
    const images = {
        furniture: '/products/table.svg',
        'tv-led': '/products/tv55.svg',
        graphics: '/products/backdrop.svg',
    };
    return images[category] || '/products/table.svg';
}

function cleanProductName(name) {
    return name
        .replace(/^\d+[\.\)]\s*/, '')       // Remove leading numbering "1. " or "1) "
        .replace(/\s+/g, ' ')              // Normalize whitespace
        .replace(/^[-–—•·]\s*/, '')        // Remove leading bullets
        .trim();
}

function looksLikeStructuredProductLine(line) {
    const compact = cleanProductName(line);
    return /\bID\s*\d{4,5}\b/i.test(compact)
        || (/\b\d{4,5}\b/.test(compact) && /\b[A-Z]{3,}[A-Z0-9]+\b/.test(compact) && /H\d+/i.test(compact));
}

function isRateTableLine(line) {
    const compact = cleanProductName(line);
    const numericValues = compact.match(/\d+(?:\.\d{1,3})?/g) || [];
    const hasStandaloneId = /\b\d{4,5}\b/.test(compact);
    const hasCode = /\b[A-Z]{3,}[A-Z0-9]+\b/.test(compact);
    const hasDimensions = /H\d+(?:\.\d+)?(?:\*|x)D?\d+(?:\.\d+)?(?:\*|x)W?\d+(?:\.\d+)?/i.test(compact);

    return !/\bID\s*\d{4,5}\b/i.test(compact)
        && hasStandaloneId
        && hasCode
        && hasDimensions
        && numericValues.length >= 3;
}

function extractStructuredFields(text) {
    const raw = cleanProductName(text || '');
    const compact = raw.replace(/\s+/g, ' ').trim();

    const idMatch = compact.match(/\bID\s*([\d\s;:]+)/i)
        || compact.match(/(?:^|\s)(\d{4,5}(?:\s*[;:/]\s*\d{4,5})*)\s+[A-Z]{2,}[A-Z0-9]+\b/);
    const codeMatch = compact.match(/\b(?:ID[\d\s;:]+)?\s*([A-Z]{2,}[A-Z0-9]+)\b/)
        || compact.match(/\b\d{4,5}(?:\s*[;:/]\s*\d{4,5})*\s+([A-Z]{2,}[A-Z0-9]+)\b/);
    const stockMatch = compact.match(/\[([^\]]+)\]/);
    // Strip "DIMENSIONS (cm):" text before matching dims so it doesn't confuse parsing
    const compactNoDimsText = compact.replace(/\bDIMENSIONS?\s*(?:\(cm\))?\s*[:\-–]?\s*/gi, '');
    // Pattern A: H-prefixed with optional D/W labels (captures 3 numbers individually for normalization)
    const dimsMatchH = compactNoDimsText.match(/\bH(\d+(?:\.\d+)?)[xX*×][A-Za-z]?(\d+(?:\.\d+)?)[xX*×][A-Za-z]?(\d+(?:\.\d+)?)(?:cm)?\b/i);
    // Pattern B: Plain 3-number format: 79x47x51 or 79x47x51cm
    const dimsMatchPlain = !dimsMatchH ? compactNoDimsText.match(/\b(\d{2,3})[xX*×](\d{2,3})[xX*×](\d{2,3})(?:cm)?\b/) : null;
    const typeMatch = compact.match(/^([A-Za-z][A-Za-z\s/&-]{2,}?)\s+(?:ID\s*)?\d{4,5}\b/i);

    const colorCandidates = ['Black/White', 'Black/Silver', 'Dark Brown', 'Dark Grey', 'Light Grey', 'Cream/Grey', 'Clear Acrylic', 'Blue/Chrome', 'Black/Chrome', 'White/Chrome', 'Black', 'White', 'Grey', 'Red', 'Orange', 'Green', 'Blue', 'Cream', 'Beige', 'Glass', 'Chrome'];
    const normalizedText = compact.replace(/\//g, '/').replace(/\s+/g, ' ');
    const colour = colorCandidates.find(candidate => new RegExp(candidate.replace('/', '\\/').replace(/\s+/g, '\\s+'), 'i').test(normalizedText)) || '';

    let cleanName = compact
        .replace(/^ID[\d\s;:]+/i, '')
        .replace(/^[A-Z]{2,}[A-Z0-9]+\s*/, '')
        .replace(/\[[^\]]+\]/, '')
        .replace(/\bDIMENSIONS?\s*(?:\(cm\))?\s*[:\-–]?\s*/gi, ' ')         // strip "DIMENSIONS (cm):" text
        .replace(/H\d+(?:\.\d+)?(?:[xX*×])[A-Za-z]?\d+(?:\.\d+)?(?:[xX*×])[A-Za-z]?\d+(?:\.\d+)?cm?/i, '') // H-prefixed dims
        .replace(/\b\d{2,3}[xX*×]\d{2,3}[xX*×]\d{2,3}(?:cm)?\b/i, '')       // plain NxNxN dims
        .replace(/\s+/g, ' ')
        .trim();

    cleanName = cleanName
        .replace(/Polypropylene Seat\s*&\s*Backrest/i, 'Visitor Chair')
        .replace(/Molded PVC/i, 'Molded PVC')
        .replace(/PU leather\s*&\s*polyester/i, 'Bean bag PU leather & polyester')
        .trim();

    // Normalize extracted dims to H×D×W (without trailing cm, consistent with DB storage)
    let dimsValue = '';
    if (dimsMatchH) {
        dimsValue = `H${dimsMatchH[1]}xD${dimsMatchH[2]}xW${dimsMatchH[3]}`;
    } else if (dimsMatchPlain) {
        dimsValue = `H${dimsMatchPlain[1]}xD${dimsMatchPlain[2]}xW${dimsMatchPlain[3]}`;
    }

    return {
        original: compact,
        type: typeMatch ? typeMatch[1].trim().replace(/\s+/g, ' ') : '',
        idNo: idMatch ? idMatch[1].trim().replace(/\s*[;:/]\s*/g, ' / ') : '',
        code: codeMatch ? codeMatch[1].trim() : '',
        stockQty: stockMatch ? stockMatch[1].trim().replace(/\s*;\s*/g, ' / ') : '',
        dimensions: dimsValue,
        colour,
        cleanName: cleanName || compact,
        rate: inferTrailingRate(compact),
    };
}

function buildExtractedProduct({
    rawName,
    fallbackDescription = '',
    category = 'furniture',
    price = 0,
    image,
    inStock = true,
    stockQty = '',
    featured = false,
    productType = '',
    needsReview = false,
}) {
    const fields = extractStructuredFields(rawName);
    const resolvedStock = stockQty || fields.stockQty || '';

    return {
        originalName: rawName,
        name: fields.cleanName || cleanProductName(rawName),
        description: fallbackDescription || fields.original || '',
        category,
        price: parseFloat(price) || fields.rate || 0,
        image: image || getCategoryImage(category),
        inStock,
        featured,
        productType: productType || fields.type || '',
        stockQty: resolvedStock,
        idNo: fields.idNo,
        code: fields.code,
        colour: fields.colour,
        dimensions: fields.dimensions,
        _needsReview: needsReview || !(fields.cleanName || '').trim(),
    };
}

function inferTrailingRate(text) {
    const compact = cleanProductName(text);
    const withoutDims = compact
        .replace(/^ID[\s\d;:/-]+/i, ' ')
        .replace(/^\s*[A-Z]{2,}[A-Z0-9]+\s+/, ' ')
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/H\d+(?:\.\d+)?(?:\*|x)D?\d+(?:\.\d+)?(?:\*|x)W?\d+(?:\.\d+)?cm?/ig, ' ');
    const tailNumbers = withoutDims.match(/\d+(?:\.\d{1,3})?/g) || [];
    if (tailNumbers.length < 2) return 0;
    const parsed = tailNumbers
        .map(value => parseFloat(value))
        .filter(value => value > 0 && value < 500);
    return parsed.length > 0 ? parsed[parsed.length - 1] : 0;
}

function buildRateRegistryFromLines(lines) {
    const registry = {};

    for (const line of lines) {
        const compact = cleanProductName(line);
        if (!compact || compact.length < 8) continue;
        const fields = extractStructuredFields(compact);
        const rate = fields.rate || inferTrailingRate(compact);
        if (!fields.idNo || !rate) continue;

        for (const id of fields.idNo.split(' / ')) {
            const trimmed = id.trim();
            if (trimmed) registry[trimmed] = rate;
        }
    }

    return registry;
}

function mergeRateTableProducts(products, rateTableProducts) {
    if (rateTableProducts.length === 0) return products;

    const merged = [...products];

    for (const rateProduct of rateTableProducts) {
        const matchIndex = merged.findIndex(product =>
            (rateProduct.idNo && product.idNo && product.idNo === rateProduct.idNo)
            || (rateProduct.code && product.code && product.code === rateProduct.code)
        );

        if (matchIndex >= 0) {
            const current = merged[matchIndex];
            merged[matchIndex] = {
                ...current,
                productType: current.productType || rateProduct.productType || '',
                price: current.price || rateProduct.price,
                colour: current.colour || rateProduct.colour,
                dimensions: current.dimensions || rateProduct.dimensions,
                stockQty: current.stockQty || rateProduct.stockQty,
                _needsReview: current._needsReview && !rateProduct.price,
            };
            continue;
        }

        merged.push(rateProduct);
    }

    return merged;
}

function firstValue(values = []) {
    for (const value of values) {
        if (value) return value;
    }
    return 0;
}

function normalizeExtractedProduct(product) {
    const rebuilt = buildExtractedProduct({
        rawName: product.originalName || product.name,
        fallbackDescription: product.description,
        category: product.category,
        price: product.price,
        image: product.image,
        inStock: product.inStock,
        stockQty: product.stockQty || product.stock,
        featured: product.featured,
        productType: product.productType,
        needsReview: product._needsReview,
    });

    return {
        ...product,
        ...rebuilt,
        idNo: product.idNo || rebuilt.idNo || '',
        code: product.code || rebuilt.code || '',
        colour: product.colour || rebuilt.colour || '',
        dimensions: product.dimensions || rebuilt.dimensions || '',
        productType: product.productType || rebuilt.productType || '',
        stockQty: product.stockQty || rebuilt.stockQty || '',
        _catalogNum: product.idNo || rebuilt.idNo || '',
        _dims: product.dimensions || rebuilt.dimensions || '',
    };
}

function findValue(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') return row[key];
        const found = Object.keys(row).find(k => k.toLowerCase().trim() === key);
        if (found && row[found] !== undefined && row[found] !== '') return row[found];
    }
    return '';
}

function buildRateRegistry(text) {
    const registry = {};
    
    // Pattern: 4-digit ID followed by uppercase Product Code
    // We use a non-greedy match for segments to avoid skipping rows
    const segments = text.split(/\b(\d{4})\s+([A-Z]{3,}[A-Z0-9]*)\b/);
    
    for (let i = 1; i < segments.length; i += 3) {
        const id = segments[i];
        const nextSegment = segments[i + 2] || "";
        
        // Find all numbers in the text following this ID until the next ID/Code pair
        // Allow decimals with any number of digits (e.g., 0.500)
        const numbers = nextSegment.match(/\d+(?:\.\d+)?/g);
        if (numbers && numbers.length > 0) {
            // The Rate is usually the last number in the row
            // However, we should filter out numbers that look like the next ID if the split failed
            const filtered = numbers.filter(n => {
                const val = parseFloat(n);
                // Heuristic: Rates in this doc are <= 500, and usually small.
                // IDs are > 1000. If we see a number > 1000 at the end, it's probably a misplaced ID tag.
                return val < 1000; 
            });
            
            if (filtered.length > 0) {
                registry[id] = parseFloat(filtered[filtered.length - 1]);
            } else {
                // If only large numbers found, use the last one anyway (could be a high rate)
                registry[id] = parseFloat(numbers[numbers.length - 1]);
            }
        }
    }
    
    return registry;
}
