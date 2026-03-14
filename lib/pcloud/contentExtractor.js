/**
 * ContentExtractor — extract text content from supported file types.
 * Uses pdf-parse (already installed), xlsx (already installed),
 * jszip (already installed) for PPTX/DOCX, and native fs for TXT/CSV.
 */

import fs from 'fs';
import path from 'path';
import * as providers from './providers.js';

const MAX_TEXT = 50000;

/**
 * Extract text content from a file based on its extension.
 * @param {string} absolutePath — full path to the file
 * @param {string} extension — file extension (without dot)
 * @returns {{ rawText, cleanedText, previewText, pageCount, extractionType, extractionStatus, extractionNotes }}
 */
export async function extractContent(absolutePath, extension) {
    const ext = (extension || '').toLowerCase();

    try {
        switch (ext) {
            case 'txt':
            case 'md':
            case 'csv':
            case 'json':
                return await extractPlainText(absolutePath, ext);
            case 'pdf':
                return await extractPDF(absolutePath);
            case 'docx':
                return await extractDOCX(absolutePath);
            case 'xlsx':
            case 'xls':
                return await extractXLSX(absolutePath);
            case 'pptx':
                return await extractPPTX(absolutePath);
            case 'jpg': case 'jpeg': case 'png': case 'webp':
                return await extractMedia(absolutePath, 'image');
            case 'mp3': case 'wav': case 'm4a':
                return await extractMedia(absolutePath, 'audio');
            default:
                return {
                    rawText: null,
                    cleanedText: null,
                    previewText: null,
                    pageCount: null,
                    extractionType: 'unsupported',
                    extractionStatus: 'skipped',
                    extractionNotes: `Extraction not supported for .${ext} files`,
                };
        }
    } catch (err) {
        return {
            rawText: null,
            cleanedText: null,
            previewText: null,
            pageCount: null,
            extractionType: 'text',
            extractionStatus: 'failed',
            extractionNotes: `Extraction failed: ${err.message}`,
        };
    }
}

async function extractPlainText(filePath, ext) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const cleaned = raw.replace(/\r\n/g, '\n').trim();
    return {
        rawText: raw.slice(0, 50000), // cap at 50KB
        cleanedText: cleaned.slice(0, 50000),
        previewText: cleaned.slice(0, 500),
        pageCount: null,
        extractionType: ext === 'csv' ? 'csv' : 'plaintext',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractPDF(filePath) {
    const pdfParse = (await import('pdf-parse')).default;
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const cleaned = (data.text || '').replace(/\s+/g, ' ').trim();
    return {
        rawText: (data.text || '').slice(0, 50000),
        cleanedText: cleaned.slice(0, 50000),
        previewText: cleaned.slice(0, 500),
        pageCount: data.numpages || null,
        extractionType: 'pdf',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractDOCX(filePath) {
    const JSZip = (await import('jszip')).default;
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file('word/document.xml')?.async('string');
    if (!docXml) {
        return {
            rawText: null, cleanedText: null, previewText: null, pageCount: null,
            extractionType: 'docx', extractionStatus: 'failed',
            extractionNotes: 'Could not find word/document.xml in DOCX',
        };
    }
    // Strip XML tags to get text
    const raw = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
        rawText: raw.slice(0, 50000),
        cleanedText: raw.slice(0, 50000),
        previewText: raw.slice(0, 500),
        pageCount: null,
        extractionType: 'docx',
        extractionStatus: 'completed',
        extractionNotes: null,
    };
}

async function extractXLSX(filePath) {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);
    const texts = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        texts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }
    const raw = texts.join('\n\n').slice(0, 50000);
    const cleaned = raw.replace(/,{2,}/g, ',').replace(/\n{3,}/g, '\n\n').trim();
    return {
        rawText: raw,
        cleanedText: cleaned.slice(0, 50000),
        previewText: cleaned.slice(0, 500),
        pageCount: workbook.SheetNames.length,
        extractionType: 'xlsx',
        extractionStatus: 'completed',
        extractionNotes: `${workbook.SheetNames.length} sheet(s): ${workbook.SheetNames.join(', ')}`,
    };
}

async function extractPPTX(filePath) {
    const JSZip = (await import('jszip')).default;
    const buffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buffer);
    const slideTexts = [];
    const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
        .sort();

    for (const slidePath of slideFiles) {
        const xml = await zip.file(slidePath)?.async('string');
        if (xml) {
            const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) slideTexts.push(text);
        }
    }

    const raw = slideTexts.join('\n\n').slice(0, 50000);
    return {
        rawText: raw,
        cleanedText: raw,
        previewText: raw.slice(0, 500),
        pageCount: slideFiles.length,
        extractionType: 'pptx',
        extractionStatus: slideTexts.length > 0 ? 'completed' : 'partial',
        extractionNotes: `${slideFiles.length} slide(s) found`,
    };
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
        
        // Use Vision if OCR is empty or low confidence
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
