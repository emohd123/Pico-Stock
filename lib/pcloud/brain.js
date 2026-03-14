/**
 * lib/pcloud/brain.js — LLM-based deep document understanding.
 */

import { openaiClient } from './providers.js';

/**
 * Deeply analyze document content using LLM.
 * @param {string} text — Extracted text preview
 * @param {string} filename — Original filename
 * @param {string} relativePath — Relative path for context
 */
export async function analyzeWithBrain(text, filename, relativePath) {
    if (!openaiClient || !text) return null;

    try {
        const prompt = `
Analyze this file for a corporate indexing system.
You are given the filename, path, and a preview of its extracted text.
Extract the most likely Client, Project/Event, and Document Type.

FILENAME: ${filename}
PATH: ${relativePath}
CONTENT PREVIEW:
"${text.substring(0, 3000)}"

RESPOND ONLY IN JSON FORMAT:
{
  "client": "Name of the client (e.g. Google, stc, Aramco) or null if unknown",
  "project": "Name of the project or event (e.g. Leap 2024, Booth Design v2) or null if unknown",
  "documentType": "One of: quotation, contract, presentation, report, spreadsheet, scanned_document, or null",
  "summary": "A 1-sentence descriptive summary of the file content",
  "confidence": 0-1 (e.g. 0.85)
}
`;

        const response = await openaiClient.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 300,
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result;

    } catch (error) {
        console.error(`Brain analysis failed for ${filename}:`, error.message);
        return null;
    }
}
