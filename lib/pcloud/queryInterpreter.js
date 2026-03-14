import OpenAI from 'openai';

/**
 * interpretQuery — Uses LLM to convert natural language search into structured parameters.
 */
export async function interpretQuery(queryText) {
    if (!process.env.OPENAI_API_KEY) {
        return null;
    }

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    
    if (!queryText || queryText.length < 3) return null;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a search intent analyzer for a corporate digital asset management system (pCloud).
Extract search filters from the user's natural language query.

Return ONLY a JSON object with these keys (use null if not found):
- client: (string) The company or client name mentioned.
- project: (string) The specific project or event name.
- documentType: (string) Normalized type: "quotation", "contract", "presentation", "render", "report", "spreadsheet", "photo_asset", "video_asset", "audio_recording", "scanned_document".
- year: (number) The specific year mentioned (e.g., 2024).
- location: (string) Geographic location if relevant.
- intent: (string) "search" (finding files) or "ask" (wanting an explanation/answer).
- status: (string) "active", "archived", or null.
- limit: (number) if user asked for a specific number of results.

Example: "latest stc quotes from 2023" -> {"client": "stc", "documentType": "quotation", "year": 2023, "intent": "search", "status": "active"}`
                },
                {
                    role: 'user',
                    content: queryText
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0,
        });

        const result = JSON.parse(response.choices[0].message.content);
        return result;
    } catch (err) {
        console.error('Query interpretation failed:', err);
        return null;
    }
}
