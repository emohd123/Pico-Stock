/**
 * Pico Brain chat service.
 * Handles multi-turn conversations with full memory, hybrid search context,
 * and multi-source knowledge (files, products, portfolio, Zoho, OSFam).
 *
 * All Supabase operations use the service-key client to bypass RLS.
 * GPT-4o is used for main chat completions; GPT-4o-mini for auto-titling.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { hybridSearch } from './hybridSearch.js';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

// Service-key Supabase client (bypasses RLS — server-side only)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// OpenAI client — initialised lazily so the module loads without a key
function getOpenAI() {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapThread(row) {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        messageCount: row.message_count || 0,
    };
}

function mapMessage(row) {
    if (!row) return null;
    return {
        id: row.id,
        threadId: row.thread_id,
        role: row.role,
        content: row.content,
        sources: row.sources || [],
        confidence: row.confidence || null,
        confidenceScore: Number(row.confidence_score) || 0,
        createdAt: row.created_at,
    };
}

function mapPin(row) {
    if (!row) return null;
    return {
        id: row.id,
        messageId: row.message_id,
        userId: row.user_id,
        title: row.title,
        content: row.content,
        sources: row.sources || [],
        tags: row.tags || [],
        createdAt: row.created_at,
    };
}

// ---------------------------------------------------------------------------
// Thread management
// ---------------------------------------------------------------------------

/**
 * Create a new chat thread.
 * @param {string} userId - The authenticated user's ID
 * @param {string} [title] - Optional initial title (auto-generated after first message)
 * @returns {Promise<object>} The created thread
 */
export async function createThread(userId, title = 'New conversation') {
    const { data, error } = await supabase
        .from('brain_chat_threads')
        .insert([{
            user_id: userId,
            title,
            message_count: 0,
            last_message_at: new Date().toISOString(),
        }])
        .select()
        .single();

    if (error) {
        console.error('[chatService] createThread error:', error.message);
        throw new Error(`Failed to create thread: ${error.message}`);
    }
    return mapThread(data);
}

/**
 * Fetch a single thread with its messages.
 * @param {string} threadId
 * @returns {Promise<{thread, messages}|null>}
 */
export async function getThread(threadId) {
    const [threadResult, messagesResult] = await Promise.all([
        supabase
            .from('brain_chat_threads')
            .select('*')
            .eq('id', threadId)
            .single(),
        supabase
            .from('brain_chat_messages')
            .select('*')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true }),
    ]);

    if (threadResult.error) return null;

    return {
        thread: mapThread(threadResult.data),
        messages: (messagesResult.data || []).map(mapMessage),
    };
}

/**
 * List all threads for a user, newest first.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listThreads(userId) {
    const { data, error } = await supabase
        .from('brain_chat_threads')
        .select('*')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false });

    if (error) {
        console.error('[chatService] listThreads error:', error.message);
        return [];
    }
    return (data || []).map(mapThread);
}

/**
 * Delete a thread and all its messages.
 * @param {string} threadId
 */
export async function deleteThread(threadId) {
    // Messages are deleted first (or rely on FK cascade if configured)
    await supabase
        .from('brain_chat_messages')
        .delete()
        .eq('thread_id', threadId);

    const { error } = await supabase
        .from('brain_chat_threads')
        .delete()
        .eq('id', threadId);

    if (error) {
        console.error('[chatService] deleteThread error:', error.message);
        throw new Error(`Failed to delete thread: ${error.message}`);
    }
}

/**
 * Fetch the last N messages for a thread (for context window construction).
 * @param {string} threadId
 * @param {number} [limit=20]
 * @returns {Promise<object[]>} Messages in chronological order
 */
export async function getThreadMessages(threadId, limit = 20) {
    // Fetch the most recent `limit` messages, then reverse to get chronological order
    const { data, error } = await supabase
        .from('brain_chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[chatService] getThreadMessages error:', error.message);
        return [];
    }
    return (data || []).map(mapMessage).reverse();
}

// ---------------------------------------------------------------------------
// Confidence determination
// ---------------------------------------------------------------------------

/**
 * Determine confidence label from the top file's RRF/vector score.
 * @param {object[]} fileResults - Hydrated file results from hybridSearch
 * @returns {{ confidence: string, confidenceScore: number }}
 */
function determineConfidence(fileResults) {
    if (!fileResults || fileResults.length === 0) {
        return { confidence: 'low', confidenceScore: 0 };
    }

    // Use the highest of rrfScore or vectorScore as the primary signal
    const topScore = Math.max(
        fileResults[0].rrfScore || 0,
        fileResults[0].vectorScore || 0,
        fileResults[0].confidenceScore || 0
    );

    if (topScore >= 0.75) return { confidence: 'high', confidenceScore: topScore };
    if (topScore >= 0.45) return { confidence: 'medium', confidenceScore: topScore };
    return { confidence: 'low', confidenceScore: topScore };
}

// ---------------------------------------------------------------------------
// Context builder (dynamic import — may not exist yet)
// ---------------------------------------------------------------------------

async function buildContext(userMessage, fileResults, userId) {
    try {
        const { buildContext: _buildContext } = await import('@/lib/brain/contextBuilder');
        return await _buildContext(userMessage, fileResults, userId);
    } catch {
        // contextBuilder not yet available — build a minimal fallback context
        if (!fileResults || fileResults.length === 0) {
            return 'No relevant files were found in the company knowledge base for this query.';
        }

        const snippets = fileResults.slice(0, 6).map((f, i) => {
            const label = [f.client, f.project, f.docType].filter(Boolean).join(' / ');
            return `[${i + 1}] ${f.filename}${label ? ` (${label})` : ''}\nSummary: ${f.summary || 'No summary available.'}\nPreview: ${(f.previewText || '').slice(0, 300)}`;
        });

        return `RELEVANT COMPANY FILES:\n\n${snippets.join('\n\n---\n\n')}`;
    }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Pico Brain, the AI knowledge assistant for Pico, a digital solutions and stock photography company.

You have access to the company's indexed file library, product catalogue, portfolio, and business knowledge. Your role is to help the team find information, answer questions, and surface insights from company data.

Guidelines:
- Be concise, professional, and direct. Avoid filler phrases.
- If the provided context contains relevant information, cite it specifically.
- If you are uncertain or the context is insufficient, say so clearly — do not fabricate details.
- When referencing a file, include its filename and path when available.
- If a question is outside the provided context, answer from your general knowledge but make clear you are doing so.
- Format responses clearly. Use bullet points or numbered lists when appropriate.
- Keep responses focused. Aim for under 400 words unless the question demands depth.`;

// ---------------------------------------------------------------------------
// sendMessage — the main function
// ---------------------------------------------------------------------------

/**
 * Send a user message to a thread and get an AI response.
 *
 * Steps:
 *  1. Save user message
 *  2. Load conversation history (last 10 messages)
 *  3. Run hybrid search for relevant files
 *  4. Build context string
 *  5. Call GPT-4o
 *  6. Determine confidence
 *  7. Save assistant message
 *  8. Auto-title thread if this is the first message
 *  9. Return structured response
 *
 * @param {string} threadId
 * @param {string} userMessage
 * @param {string} userId
 * @returns {Promise<{answer, sources, confidence, confidenceScore, threadId, messageId}>}
 */
export async function sendMessage(threadId, userMessage, userId) {
    // ── 1. Save user message ───────────────────────────────────────────────
    const { data: savedUserMsg, error: userMsgError } = await supabase
        .from('brain_chat_messages')
        .insert([{
            thread_id: threadId,
            role: 'user',
            content: userMessage,
        }])
        .select()
        .single();

    if (userMsgError) {
        console.error('[chatService] Failed to save user message:', userMsgError.message);
        throw new Error(`Failed to save message: ${userMsgError.message}`);
    }

    // ── 2. Load conversation history (last 10 messages before this one) ────
    const history = await getThreadMessages(threadId, 10);
    // Exclude the message we just inserted so we don't double-count it
    const historyForContext = history.filter((m) => m.id !== savedUserMsg.id);

    // ── 3. Hybrid search for relevant files ────────────────────────────────
    let fileResults = [];
    try {
        const searchResult = await hybridSearch(userMessage, {}, { pageSize: 6 });
        fileResults = searchResult.results || [];
    } catch (searchErr) {
        console.warn('[chatService] hybridSearch failed:', searchErr.message);
        // Non-fatal — proceed without file context
    }

    // ── 4. Build context string ────────────────────────────────────────────
    const contextBlock = await buildContext(userMessage, fileResults, userId);

    // ── 5. Build messages array for GPT-4o ────────────────────────────────
    const openai = getOpenAI();

    if (!openai) {
        // OpenAI unavailable — return a helpful offline message
        const offlineAnswer = 'Pico Brain is currently offline. The AI assistant requires an OpenAI API key to be configured. Please contact your administrator.';

        const { data: savedAssistantMsg } = await supabase
            .from('brain_chat_messages')
            .insert([{
                thread_id: threadId,
                role: 'assistant',
                content: offlineAnswer,
                sources: [],
                confidence: 'low',
                confidence_score: 0,
            }])
            .select()
            .single();

        await updateThreadMeta(threadId, offlineAnswer);

        return {
            answer: offlineAnswer,
            sources: [],
            confidence: 'low',
            confidenceScore: 0,
            threadId,
            messageId: savedAssistantMsg?.id || null,
        };
    }

    // Build the messages array: system → history → context injection → user
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        // Inject conversation history
        ...historyForContext.map((m) => ({
            role: m.role,
            content: m.content,
        })),
        // Inject retrieved context as a system-level note just before the user turn
        ...(contextBlock
            ? [{
                role: 'system',
                content: `CONTEXT FROM COMPANY KNOWLEDGE BASE:\n\n${contextBlock}`,
            }]
            : []),
        // Current user message
        { role: 'user', content: userMessage },
    ];

    // ── 6. Call GPT-4o ─────────────────────────────────────────────────────
    let answer = '';
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            max_tokens: 1500,
            temperature: 0.4,
        });
        answer = completion.choices[0]?.message?.content?.trim() || '';
    } catch (aiErr) {
        console.error('[chatService] GPT-4o call failed:', aiErr.message);
        answer = 'I encountered an error while generating a response. Please try again in a moment.';
    }

    // ── 7. Determine confidence + build sources list ───────────────────────
    const { confidence, confidenceScore } = determineConfidence(fileResults);

    const sources = fileResults.slice(0, 6).map((f) => ({
        id: f.id,
        filename: f.filename,
        relativePath: f.relativePath,
        client: f.client,
        project: f.project,
        docType: f.docType,
        summary: f.summary,
        rrfScore: f.rrfScore,
        vectorScore: f.vectorScore,
    }));

    // ── 8. Save assistant message ──────────────────────────────────────────
    const { data: savedAssistantMsg, error: asstMsgError } = await supabase
        .from('brain_chat_messages')
        .insert([{
            thread_id: threadId,
            role: 'assistant',
            content: answer,
            sources,
            confidence,
            confidence_score: confidenceScore,
        }])
        .select()
        .single();

    if (asstMsgError) {
        console.error('[chatService] Failed to save assistant message:', asstMsgError.message);
        // Non-fatal — we still return the answer
    }

    // ── 9. Update thread metadata + auto-title if first message ───────────
    await updateThreadMeta(threadId, answer);

    // Check if this was the first exchange and auto-title the thread
    const isFirstMessage = historyForContext.length === 0;
    if (isFirstMessage) {
        // Fire-and-forget — don't block the response
        autoTitleThread(threadId, userMessage).catch((err) =>
            console.warn('[chatService] autoTitleThread failed:', err.message)
        );
    }

    return {
        answer,
        sources,
        confidence,
        confidenceScore,
        threadId,
        messageId: savedAssistantMsg?.id || null,
    };
}

// ---------------------------------------------------------------------------
// Thread metadata helper
// ---------------------------------------------------------------------------

/**
 * Update last_message_at and increment message_count for a thread.
 * @param {string} threadId
 * @param {string} lastMessage - Used to update a preview if needed
 */
async function updateThreadMeta(threadId, _lastMessage) {
    await supabase
        .from('brain_chat_threads')
        .update({
            last_message_at: new Date().toISOString(),
            // Increment message_count using raw SQL expression via rpc if available,
            // otherwise read-modify-write (acceptable for low-concurrency use)
        })
        .eq('id', threadId);

    // Increment message_count
    const { data: current } = await supabase
        .from('brain_chat_threads')
        .select('message_count')
        .eq('id', threadId)
        .single();

    if (current) {
        await supabase
            .from('brain_chat_threads')
            .update({ message_count: (current.message_count || 0) + 1 })
            .eq('id', threadId);
    }
}

// ---------------------------------------------------------------------------
// Auto-title
// ---------------------------------------------------------------------------

/**
 * Generate a short thread title from the first user message using GPT-4o-mini.
 * Updates the thread record in place.
 *
 * @param {string} threadId
 * @param {string} firstMessage
 */
export async function autoTitleThread(threadId, firstMessage) {
    const openai = getOpenAI();
    if (!openai) return;

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content:
                        'Generate a concise 4-6 word title for a conversation that starts with the following message. Output ONLY the title — no quotes, no punctuation at the end.',
                },
                { role: 'user', content: firstMessage.slice(0, 500) },
            ],
            max_tokens: 20,
            temperature: 0.5,
        });

        const title = completion.choices[0]?.message?.content?.trim();
        if (!title) return;

        await supabase
            .from('brain_chat_threads')
            .update({ title })
            .eq('id', threadId);
    } catch (err) {
        console.warn('[chatService] autoTitleThread GPT error:', err.message);
    }
}

// ---------------------------------------------------------------------------
// Pinned insights
// ---------------------------------------------------------------------------

/**
 * Pin a message as a reusable insight.
 *
 * @param {string} messageId - ID of the brain_chat_messages row to pin
 * @param {string} title     - Human-readable title for the pin
 * @param {string[]} tags    - Optional tags for filtering
 * @param {string} userId
 * @returns {Promise<object>} The created pin record
 */
export async function pinInsight(messageId, title, tags = [], userId) {
    // Fetch the source message to copy its content and sources
    const { data: msg, error: msgError } = await supabase
        .from('brain_chat_messages')
        .select('*')
        .eq('id', messageId)
        .single();

    if (msgError || !msg) {
        throw new Error(`Message not found: ${messageId}`);
    }

    const { data, error } = await supabase
        .from('brain_pinned_insights')
        .insert([{
            message_id: messageId,
            user_id: userId,
            title: title || 'Pinned insight',
            content: msg.content,
            sources: msg.sources || [],
            tags: tags || [],
        }])
        .select()
        .single();

    if (error) {
        console.error('[chatService] pinInsight error:', error.message);
        throw new Error(`Failed to pin insight: ${error.message}`);
    }
    return mapPin(data);
}

/**
 * Fetch the most recent pinned insights (public / team-wide).
 *
 * @param {number} [limit=20]
 * @returns {Promise<object[]>}
 */
export async function getPinnedInsights(limit = 20) {
    const { data, error } = await supabase
        .from('brain_pinned_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[chatService] getPinnedInsights error:', error.message);
        return [];
    }
    return (data || []).map(mapPin);
}

/**
 * Delete a pinned insight by ID.
 *
 * @param {string} pinId
 */
export async function deletePin(pinId) {
    const { error } = await supabase
        .from('brain_pinned_insights')
        .delete()
        .eq('id', pinId);

    if (error) {
        console.error('[chatService] deletePin error:', error.message);
        throw new Error(`Failed to delete pin: ${error.message}`);
    }
}
