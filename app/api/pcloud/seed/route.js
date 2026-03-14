/**
 * POST /api/pcloud/seed — populate demo data for development
 */

import { NextResponse } from 'next/server';
import { generateDemoData } from '@/lib/pcloud/demo';
import { upsertFileRecord, upsertUnderstanding, upsertReviewItem } from '@/lib/pcloud/store';
import { supabase } from '@/lib/supabase';

export async function POST() {
    try {
        // Clear existing demo data
        await supabase.from('pcloud_review_queue').delete().eq('status', 'pending');
        await supabase.from('pcloud_extracted_contents').delete().neq('id', '');
        await supabase.from('pcloud_file_understandings').delete().neq('id', '');
        await supabase.from('pcloud_file_records').delete().neq('id', '');

        const demoData = generateDemoData();

        let created = 0;
        let reviewItems = 0;

        for (const item of demoData) {
            await upsertFileRecord(item.fileRecord);
            await upsertUnderstanding(item.understanding);
            if (item.reviewItem) {
                await upsertReviewItem(item.reviewItem);
                reviewItems++;
            }
            created++;
        }

        return NextResponse.json({
            success: true,
            message: `Seeded ${created} demo files (${reviewItems} need review)`,
            created,
            reviewItems,
        });
    } catch (err) {
        console.error('Seed error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
