/**
 * POST /api/pcloud/scan — trigger file system scan & indexing
 */

import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { scanDirectory, isSourceAvailable, getSourceRoot } from '@/lib/pcloud/scanner';
import { processFile } from '@/lib/pcloud/orchestrator';
import { createJob, updateJob, logProcessingError } from '@/lib/pcloud/store';

export async function POST(request) {
    try {
        const rootPath = getSourceRoot();

        if (!isSourceAvailable()) {
            return NextResponse.json({
                success: false,
                error: `Source root "${rootPath}" is not accessible. Connect the pCloud sync drive or set PCLOUD_SOURCE_ROOT.`,
            }, { status: 400 });
        }

        // Create a processing job
        const job = await createJob({
            id: uuidv4(),
            jobType: 'scan',
            rootPath,
        });

        // Scan the file system
        const files = scanDirectory(rootPath);

        await updateJob(job.id, { totalFiles: files.length });

        // Run processing in the background to avoid HTTP timeout
        (async () => {
            let processed = 0;
            let errors = 0;

            // Process each file through the understanding pipeline
            for (const fileInfo of files) {
                try {
                    await processFile(fileInfo, { jobId: job.id });
                    processed++;
                } catch (err) {
                    errors++;
                    console.error(`Failed to process ${fileInfo.relativePath}:`, err.message);
                }

                // Update progress every 50 files
                if ((processed + errors) % 50 === 0) {
                    await updateJob(job.id, {
                        processedFiles: processed,
                        errorCount: errors,
                    });
                }
            }

            // Mark job complete
            await updateJob(job.id, {
                status: 'completed',
                processedFiles: processed,
                errorCount: errors,
                completedAt: new Date().toISOString(),
                notes: `Scanned ${files.length} files from ${rootPath}`,
            });
        })().catch(async (err) => {
            console.error('Background scan failed:', err);
            await logProcessingError({
                id: uuidv4(),
                jobId: job.id,
                errorType: 'scan_background_crash',
                errorMessage: err.message,
                stackTrace: err.stack,
            });
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            totalFiles: files.length,
            message: 'Scan started in background',
        });
    } catch (err) {
        console.error('Scan trigger failed:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
