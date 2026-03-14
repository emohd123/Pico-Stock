/**
 * worker/extractor.js — Content extraction for supported file types.
 * CommonJS version for the standalone worker.
 * Uses: pdf-parse, xlsx, jszip (all pre-installed).
 */

const providers = require('./providers');

const MAX_TEXT = 50000; // Cap extracted text at 50KB

/**
 * Extract text content from a file.
 * @param {string} absolutePath
 * @param {string} extension (without dot)
 * @returns {{ rawText, cleanedText, previewText, pageCount, extractionType, extractionStatus, extractionNotes }}
 */
async function extractContent(absolutePath, extension) {
    const ext = (extension || '').toLowerCase();

    try {
        switch (ext) {
            case 'txt': case 'md': case 'csv': case 'json':
                return extractPlainText(absolutePath, ext);
            case 'pdf':
                return await extractPDF(absolutePath);
            case 'docx':
                return await extractDOCX(absolutePath);
            case 'xlsx': case 'xls':
                return await extractXLSX(absolutePath);
            case 'pptx':
                return await extractPPTX(absolutePath);
            case 'jpg': case 'jpeg': case 'png': case 'webp':
                return await extractMedia(absolutePath, 'image');
            case 'mp3': case 'wav': case 'm4a':
                return await extractMedia(absolutePath, 'audio');
            default:
                return { rawText: null, cleanedText: null, previewText: null, pageCount: null, extractionType: 'unsupported', extractionStatus: 'skipped', extractionNotes: `No extractor for .${ext}` };
        }
    } catch (err) {
        return { rawText: null, cleanedText: null, previewText: null, pageCount: null, extractionType: 'text', extractionStatus: 'failed', extractionNotes: `Extraction failed: ${err.message}` };
    }
}

async function extractMedia(filePath, type) {
    let result = null;
    let notes = [];

    if (type === 'image') {
        const ocr = await providers.extractImageText(filePath);
        if (ocr && ocr.text) {
            result = ocr.text;
            notes.push(`OCR: ${Math.round(ocr.confidence * 100)}% conf`);
        }
        
        // If OCR is empty or low confidence, try Vision
        if (!result || (ocr && ocr.confidence < 0.3)) {
            const vision = await providers.analyzeVision(filePath);
            if (vision && vision.description) {
                result = (result ? result + "\n\n" : "") + "Vision Analysis:\n" + vision.description;
                notes.push('Vision analyzed');
            }
        }
    } else if (type === 'audio') {
        const whisper = await providers.transcribeAudio(filePath);
        if (whisper && whisper.text) {
            result = whisper.text;
            notes.push('Whisper transcribed');
        }
    }

    if (!result) {
        return { rawText: null, cleanedText: null, previewText: null, pageCount: null, extractionType: type, extractionStatus: 'failed', extractionNotes: `No ${type} signals extracted` };
    }

    const cleaned = result.replace(/\s+/g, ' ').trim();
    return {
        rawText: result.slice(0, MAX_TEXT),
        cleanedText: cleaned.slice(0, MAX_TEXT),
        previewText: cleaned.slice(0, 500),
        pageCount: null,
        extractionType: type,
        extractionStatus: 'completed',
        extractionNotes: notes.join(', '),
    };
}

function extractPlainText(filePath, ext) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const cleaned = raw.replace(/\r\n/g, '\n').trim();
    return {
        rawText: raw.slice(0, MAX_TEXT),
        cleanedText: cleaned.slice(0, MAX_TEXT),
        previewText: cleaned.slice(0, 500),
        pageCount: null,
        extractionType: ext === 'csv' ? 'csv' : 'plaintext',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractPDF(filePath) {
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const cleaned = (data.text || '').replace(/\s+/g, ' ').trim();
    return {
        rawText: (data.text || '').slice(0, MAX_TEXT),
        cleanedText: cleaned.slice(0, MAX_TEXT),
        previewText: cleaned.slice(0, 500),
        pageCount: data.numpages || null,
        extractionType: 'pdf',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractDOCX(filePath) {
    const JSZip = require('jszip');
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
        return { rawText: null, cleanedText: null, previewText: null, pageCount: null, extractionType: 'docx', extractionStatus: 'failed', extractionNotes: 'No word/document.xml in DOCX' };
    }
    const raw = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
        rawText: raw.slice(0, MAX_TEXT),
        cleanedText: raw.slice(0, MAX_TEXT),
        previewText: raw.slice(0, 500),
        pageCount: null,
        extractionType: 'docx',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractXLSX(filePath) {
    const XLSX = require('xlsx');
    const workbook = XLSX.readFile(filePath);
    const texts = [];
    for (const name of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false });
        texts.push(`--- Sheet: ${name} ---\n${csv}`);
    }
    const raw = texts.join('\n\n').slice(0, MAX_TEXT);
    const cleaned = raw.replace(/,{2,}/g, ',').replace(/\n{3,}/g, '\n\n').trim();
    return {
        rawText: raw,
        cleanedText: cleaned.slice(0, MAX_TEXT),
        previewText: cleaned.slice(0, 500),
        pageCount: workbook.SheetNames.length,
        extractionType: 'xlsx',
        extractionStatus: 'completed',
        extractionNotes: `${workbook.SheetNames.length} sheet(s)`,
    };
}

async function extractPPTX(filePath) {
    const JSZip = require('jszip');
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter(n => n.match(/^ppt\/slides\/slide\d+\.xml$/)).sort();
    const texts = [];
    for (const sf of slideFiles) {
        const xml = await zip.file(sf)?.async('string');
        if (xml) {
            const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) texts.push(text);
        }
    }
    const raw = texts.join('\n\n').slice(0, MAX_TEXT);
    return {
        rawText: raw,
        cleanedText: raw,
        previewText: raw.slice(0, 500),
        pageCount: slideFiles.length,
        extractionType: 'pptx',
        extractionStatus: texts.length > 0 ? 'completed' : 'partial',
        extractionNotes: `${slideFiles.length} slide(s)`,
    };
}

module.exports = { extractContent };
