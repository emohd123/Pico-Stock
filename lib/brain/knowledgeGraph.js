/**
 * Brain — Knowledge Graph
 *
 * Entity extraction, storage, and retrieval.  Uses GPT-4o-mini to parse
 * entities out of document text, then persists them to Supabase via two tables:
 *
 *   brain_entities       — canonical entity records (unique by name + type)
 *   brain_file_entities  — join table linking file records → entities
 *
 * Entity types recognised: client, project, person, location, event
 *
 * Relations (co-mentions within the same file) are stored in brain_entity_relations:
 *   brain_entity_relations  — (source_entity_id, target_entity_id, relation, file_record_id)
 */

import { openaiClient } from '@/lib/pcloud/providers';
import { supabase }      from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_TYPES = ['clients', 'projects', 'people', 'locations', 'events'];

// ---------------------------------------------------------------------------
// Entity extraction (GPT-4o-mini)
// ---------------------------------------------------------------------------

/**
 * extractEntities — uses GPT-4o-mini to extract named entities from a text
 * snippet.  Returns a structured object with arrays for each entity type.
 *
 * @param {string} text     — document text (will be truncated if very long)
 * @param {string} filename — file name, used as extra context for the model
 * @param {string} path     — file path in storage
 * @returns {Promise<{ clients: string[], projects: string[], people: string[], locations: string[], events: string[] }>}
 */
export async function extractEntities(text, filename, path) {
    // Return empty result when OpenAI is not configured
    if (!openaiClient) {
        console.warn('[brain/kg] OpenAI not configured — skipping entity extraction.');
        return { clients: [], projects: [], people: [], locations: [], events: [] };
    }

    // Truncate text to keep within token limits (~8 000 chars ≈ ~2 000 tokens)
    const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text;

    const systemPrompt = `You are an entity extraction engine for an internal company document system.
Extract named entities from the provided text and return them as JSON.

Entity categories:
- clients: Company names or client organisations mentioned
- projects: Project names, event names, job names, or campaign titles
- people: Named individuals (first name, last name, or full name)
- locations: Countries, cities, venues, addresses, or regions
- events: Trade shows, summits, conferences, exhibitions, or specific named gatherings

Rules:
- Only include entities explicitly mentioned in the text — do not infer.
- Normalise names to title case.
- Remove duplicates within each category.
- If no entities are found for a category, return an empty array.
- Return ONLY valid JSON matching the schema below.

Schema:
{
  "clients": ["string"],
  "projects": ["string"],
  "people": ["string"],
  "locations": ["string"],
  "events": ["string"]
}`;

    const userContent = `Filename: ${filename}\nPath: ${path}\n\n---\n\n${truncated}`;

    try {
        const response = await openaiClient.chat.completions.create({
            model:           'gpt-4o-mini',
            response_format: { type: 'json_object' },
            temperature:     0,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userContent },
            ],
        });

        const raw = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);

        // Ensure all expected keys are present and are arrays
        return {
            clients:   Array.isArray(parsed.clients)   ? parsed.clients   : [],
            projects:  Array.isArray(parsed.projects)  ? parsed.projects  : [],
            people:    Array.isArray(parsed.people)     ? parsed.people    : [],
            locations: Array.isArray(parsed.locations)  ? parsed.locations : [],
            events:    Array.isArray(parsed.events)     ? parsed.events    : [],
        };
    } catch (err) {
        console.error('[brain/kg] extractEntities error:', err.message);
        return { clients: [], projects: [], people: [], locations: [], events: [] };
    }
}

// ---------------------------------------------------------------------------
// Entity persistence
// ---------------------------------------------------------------------------

/**
 * upsertEntities — persists the extracted entities to Supabase.
 *
 * - Upserts each entity into brain_entities (by name + type, case-insensitive).
 * - Inserts join records into brain_file_entities linking the file to entities.
 *
 * @param {string} fileRecordId — UUID of the brain_files record
 * @param {{ clients: string[], projects: string[], people: string[], locations: string[], events: string[] }} entities
 * @returns {Promise<void>}
 */
export async function upsertEntities(fileRecordId, entities) {
    if (!fileRecordId || !entities) return;

    // Map category names to singular entity type labels for storage
    const typeMap = {
        clients:   'client',
        projects:  'project',
        people:    'person',
        locations: 'location',
        events:    'event',
    };

    for (const category of ENTITY_TYPES) {
        const names = entities[category];
        if (!Array.isArray(names) || names.length === 0) continue;

        const entityType = typeMap[category];

        for (const name of names) {
            const normalisedName = name.trim();
            if (!normalisedName) continue;

            try {
                // Upsert entity — conflict on (name_normalised, type)
                const { data: entityRow, error: upsertErr } = await supabase
                    .from('brain_entities')
                    .upsert(
                        {
                            name:            normalisedName,
                            name_normalised: normalisedName.toLowerCase(),
                            type:            entityType,
                            updated_at:      new Date().toISOString(),
                        },
                        { onConflict: 'name_normalised,type', ignoreDuplicates: false }
                    )
                    .select('id')
                    .single();

                if (upsertErr) {
                    console.error(`[brain/kg] upsert entity "${normalisedName}" (${entityType}):`, upsertErr.message);
                    continue;
                }

                const entityId = entityRow?.id;
                if (!entityId) continue;

                // Link entity to file — ignore if already linked
                await supabase
                    .from('brain_file_entities')
                    .upsert(
                        { file_record_id: fileRecordId, entity_id: entityId },
                        { onConflict: 'file_record_id,entity_id', ignoreDuplicates: true }
                    );
            } catch (err) {
                console.error('[brain/kg] upsertEntities loop error:', err.message);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Entity relations
// ---------------------------------------------------------------------------

/**
 * buildEntityRelations — given a set of entities co-mentioned in the same
 * file, creates pairwise "co-mentioned" relations in brain_entity_relations.
 *
 * Relations are directional but stored bidirectionally for easy querying.
 * The relation label is "co_mentioned" unless a more specific rule applies:
 *   - person + project → "worked_on"
 *   - person + client  → "associated_with"
 *   - client + event   → "participated_in"
 *
 * @param {{ clients: string[], projects: string[], people: string[], locations: string[], events: string[] }} entities
 * @param {string} fileRecordId
 * @returns {Promise<void>}
 */
export async function buildEntityRelations(entities, fileRecordId) {
    if (!entities || !fileRecordId) return;

    // Flatten all entities with their types for pairing
    const typeMap = {
        clients:   'client',
        projects:  'project',
        people:    'person',
        locations: 'location',
        events:    'event',
    };

    // Fetch entity IDs from the database for names we just upserted
    const allItems = [];
    for (const category of ENTITY_TYPES) {
        const names = entities[category];
        if (!Array.isArray(names)) continue;
        for (const name of names) {
            if (name.trim()) allItems.push({ name: name.trim().toLowerCase(), type: typeMap[category] });
        }
    }

    if (allItems.length < 2) return;   // Need at least 2 entities to form a relation

    try {
        // Fetch IDs for all extracted entities in one query
        const { data: rows, error } = await supabase
            .from('brain_entities')
            .select('id, name_normalised, type')
            .in('name_normalised', allItems.map(i => i.name));

        if (error || !rows || rows.length < 2) return;

        // Build a map: "name|type" → id
        const entityIdMap = {};
        for (const row of rows) {
            entityIdMap[`${row.name_normalised}|${row.type}`] = row.id;
        }

        /**
         * Determine the relation label for a pair of entity types.
         * @param {string} typeA
         * @param {string} typeB
         * @returns {string}
         */
        function relationLabel(typeA, typeB) {
            const pair = [typeA, typeB].sort().join('+');
            const labels = {
                'person+project':  'worked_on',
                'client+person':   'associated_with',
                'client+event':    'participated_in',
                'event+project':   'linked_to',
                'event+location':  'held_at',
                'location+project':'located_in',
            };
            return labels[pair] || 'co_mentioned';
        }

        // Generate all pairs and insert relations
        const relationRows = [];
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const sourceId  = rows[i].id;
                const targetId  = rows[j].id;
                const relation  = relationLabel(rows[i].type, rows[j].type);

                relationRows.push({
                    source_entity_id: sourceId,
                    target_entity_id: targetId,
                    relation,
                    file_record_id:   fileRecordId,
                });
                // Also store reverse direction for bidirectional lookups
                relationRows.push({
                    source_entity_id: targetId,
                    target_entity_id: sourceId,
                    relation,
                    file_record_id:   fileRecordId,
                });
            }
        }

        if (relationRows.length > 0) {
            await supabase
                .from('brain_entity_relations')
                .upsert(relationRows, {
                    onConflict:       'source_entity_id,target_entity_id,file_record_id',
                    ignoreDuplicates: true,
                });
        }
    } catch (err) {
        console.error('[brain/kg] buildEntityRelations error:', err.message);
    }
}

// ---------------------------------------------------------------------------
// Query / context retrieval
// ---------------------------------------------------------------------------

/**
 * getEntityContext — searches brain_entities for entities matching a query
 * and returns a formatted text block for inclusion in an AI system prompt.
 *
 * Searches by partial name match (case-insensitive ilike).
 *
 * @param {string} query
 * @returns {Promise<string>}
 */
export async function getEntityContext(query) {
    if (!query || typeof query !== 'string') {
        return 'No entity query provided.';
    }

    try {
        // Search entities whose normalised name contains the query
        const { data: entities, error } = await supabase
            .from('brain_entities')
            .select('id, name, type')
            .ilike('name_normalised', `%${query.toLowerCase()}%`)
            .limit(20);

        if (error) throw error;
        if (!entities || entities.length === 0) {
            return `No entities found in the knowledge graph matching "${query}".`;
        }

        // Group entities by type for readable output
        const grouped = {};
        for (const e of entities) {
            if (!grouped[e.type]) grouped[e.type] = [];
            grouped[e.type].push(e.name);
        }

        const lines = [`Knowledge graph entities matching "${query}":`];
        for (const [type, names] of Object.entries(grouped)) {
            lines.push(`• ${type.charAt(0).toUpperCase() + type.slice(1)}s: ${names.join(', ')}`);
        }

        return lines.join('\n');
    } catch (err) {
        console.error('[brain/kg] getEntityContext error:', err.message);
        return `Entity context lookup failed: ${err.message}`;
    }
}

/**
 * getClientHistory — finds all file records linked to a given client entity
 * name. Returns an array of file metadata objects from brain_files.
 *
 * @param {string} clientName
 * @returns {Promise<Object[]>}
 */
export async function getClientHistory(clientName) {
    if (!clientName || typeof clientName !== 'string') return [];

    try {
        // Find the client entity by name (fuzzy match)
        const { data: clientEntities, error: entError } = await supabase
            .from('brain_entities')
            .select('id, name')
            .eq('type', 'client')
            .ilike('name_normalised', `%${clientName.toLowerCase()}%`)
            .limit(5);

        if (entError) throw entError;
        if (!clientEntities || clientEntities.length === 0) return [];

        const entityIds = clientEntities.map(e => e.id);

        // Find all file_record_ids linked to these entities
        const { data: fileLinks, error: linkError } = await supabase
            .from('brain_file_entities')
            .select('file_record_id')
            .in('entity_id', entityIds);

        if (linkError) throw linkError;
        if (!fileLinks || fileLinks.length === 0) return [];

        const fileRecordIds = [...new Set(fileLinks.map(l => l.file_record_id))];

        // Fetch the actual file records
        const { data: files, error: filesError } = await supabase
            .from('brain_files')
            .select('id, name, path, file_type, created_at, summary')
            .in('id', fileRecordIds)
            .order('created_at', { ascending: false });

        if (filesError) throw filesError;

        return files || [];
    } catch (err) {
        console.error('[brain/kg] getClientHistory error:', err.message);
        return [];
    }
}
