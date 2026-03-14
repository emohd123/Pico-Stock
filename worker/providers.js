/**
 * worker/providers.js — AI and OCR providers for pCloud deep understanding.
 */

const { createWorker } = require('tesseract.js');
const OpenAI = require('openai');
const fs = require('fs');
const config = require('./config');

let openaiClient = null;
if (config.openaiApiKey) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
}

/**
 * Perform local OCR on an image using Tesseract.js
 */
async function extractImageText(filePath) {
    let worker = null;
    try {
        worker = await createWorker('eng');
        const { data: { text, confidence } } = await worker.recognize(filePath);
        
        // Clean up text
        const cleaned = text.replace(/\s+/g, ' ').trim();
        
        return {
            text: cleaned,
            confidence: confidence / 100,
            provider: 'tesseract'
        };
    } catch (error) {
        console.error(`OCR Error (${filePath}):`, error.message);
        return null;
    } finally {
        if (worker) await worker.terminate();
    }
}

/**
 * Transcribe audio using OpenAI Whisper
 */
async function transcribeAudio(filePath) {
    if (!openaiClient) return null;
    
    try {
        const transcription = await openaiClient.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
        });
        
        return {
            text: transcription.text,
            provider: 'openai_whisper'
        };
    } catch (error) {
        console.error(`Whisper Error (${filePath}):`, error.message);
        return null;
    }
}

/**
 * Analyze image or video frame with Vision (gpt-4o-mini)
 */
async function analyzeVision(filePath) {
    if (!openaiClient) return null;
    
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
            description: response.choices[0].message.content,
            provider: 'openai_vision'
        };
    } catch (error) {
        console.error(`Vision Error (${filePath}):`, error.message);
        return null;
    }
}

module.exports = {
    extractImageText,
    transcribeAudio,
    analyzeVision,
    openaiClient
};
