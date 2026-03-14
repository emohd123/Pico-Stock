const { supabase } = require('./db.js');

async function analyze() {
    console.log("Analyzing indexed files...");

    // 1. Files count per understanding level
    let levelsResult;
    try {
        levelsResult = await supabase
            .from('pcloud_file_understandings')
            .select('understanding_level', { count: 'exact', head: false })
            .limit(10000); // sample
    } catch(e) { }
        
    const levelCounts = {};
    for (const row of (levelsResult.data || [])) {
        levelCounts[row.understanding_level] = (levelCounts[row.understanding_level] || 0) + 1;
    }
    console.log("Sample Understanding Levels:", levelCounts);

    // 2. Review reasons
    const reasons = await supabase
        .from('pcloud_review_queue')
        .select('review_reason', { count: 'exact', head: false })
        .limit(10000);
        
    const reasonCounts = {};
    for (const row of (reasons.data || [])) {
        reasonCounts[row.review_reason] = (reasonCounts[row.review_reason] || 0) + 1;
    }
    console.log("Sample Review Reasons:", reasonCounts);
    
    // 3. Extensions
    const extensions = await supabase
        .from('pcloud_file_records')
        .select('extension', { count: 'exact', head: false })
        .limit(10000);
        
    const extCounts = {};
    for (const row of (extensions.data || [])) {
        extCounts[row.extension] = (extCounts[row.extension] || 0) + 1;
    }
    // Sort and get top 10
    const topExts = Object.entries(extCounts).sort((a,b) => b[1]-a[1]).slice(0, 10);
    console.log("Top Extensions:", topExts);

    // 4. Sample low confidence reasons
    const lowConf = await supabase
        .from('pcloud_file_understandings')
        .select('confidence_reason, detected_media_type')
        .eq('requires_review', true)
        .limit(20);
        
    console.log("Sample Low Confidence Reasons:");
    for (const row of (lowConf.data || [])) {
        console.log(`- Type: ${row.detected_media_type}, Reason: ${row.confidence_reason}`);
    }
}

analyze().catch(console.error);
