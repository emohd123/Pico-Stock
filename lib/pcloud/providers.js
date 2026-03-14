import { createWorker } from 'tesseract.js';
import OpenAI from 'openai';
import fs from 'fs';

// Initialize OpenAI client
const openaiApiKey = process.env.OPENAI_API_KEY;
export const openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

/**
 * OCR Provider Implementation
 */
export const OCRProvider = {
    name: 'Tesseract OCR',
    supported: true,

    async process(filePath) {
        let worker = null;
        try {
            worker = await createWorker('eng');
            const { data: { text, confidence } } = await worker.recognize(filePath);
            const cleaned = text.replace(/\s+/g, ' ').trim();
            
            return {
                supported: true,
                result: cleaned,
                confidence: confidence / 100,
                provider: 'tesseract'
            };
        } catch (error) {
            console.error(`OCR Error (${filePath}):`, error.message);
            return { supported: true, result: null, error: error.message };
        } finally {
            if (worker) await worker.terminate();
        }
    },
};

/**
 * Speech-to-Text Provider (Whisper)
 */
export const SpeechToTextProvider = {
    name: 'OpenAI Whisper',
    supported: !!openaiClient,

    async process(filePath) {
        if (!openaiClient) {
            return { supported: false, result: null, error: 'OpenAI API key not configured' };
        }
        
        try {
            const transcription = await openaiClient.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
            });
            
            return {
                supported: true,
                result: transcription.text,
                provider: 'openai_whisper'
            };
        } catch (error) {
            console.error(`Whisper Error (${filePath}):`, error.message);
            return { supported: true, result: null, error: error.message };
        }
    },
};

/**
 * Vision Provider (GPT-4o-mini)
 */
export const VisionProvider = {
    name: 'OpenAI Vision',
    supported: !!openaiClient,

    async process(filePath) {
        if (!openaiClient) {
            return { supported: false, result: null, error: 'OpenAI API key not configured' };
        }
        
        try {
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            
            const response = await openaiClient.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Describe this image for a file indexing system. Focus on client names, project titles, document types, or visual content if it's a render/photo. Keep it concise." },
                            {
                                type: "image_url",
                                image_url: { "url": `data:image/jpeg;base64,${base64Image}` }
                            },
                        ],
                    },
                ],
            });
            
            return {
                supported: true,
                result: response.choices[0].message.content,
                provider: 'openai_vision'
            };
        } catch (error) {
            console.error(`Vision Error (${filePath}):`, error.message);
            return { supported: true, result: null, error: error.message };
        }
    },
};

// Legacy compatibility exports (matching worker interface)
export async function extractImageText(filePath) {
    const res = await OCRProvider.process(filePath);
    return res.result ? { text: res.result, confidence: res.confidence, provider: res.provider } : null;
}

export async function transcribeAudio(filePath) {
    const res = await SpeechToTextProvider.process(filePath);
    return res.result ? { text: res.result, provider: res.provider } : null;
}

export async function analyzeVision(filePath) {
    const res = await VisionProvider.process(filePath);
    return res.result ? { description: res.result, provider: res.provider } : null;
}
