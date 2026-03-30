function normalizeText(value) {
    return String(value || '').trim();
}

export function getStandDesignMaintenanceStatus() {
    const configured = normalizeText(process.env.STAND_DESIGN_PAUSE_HEAVY_JOBS || '');
    const paused = /^true$/i.test(configured)
        || (!configured && process.env.VERCEL === '1');

    return {
        heavy_jobs_paused: paused,
        message: paused
            ? 'Stand Design generation, regenerate, and view jobs are temporarily paused to reduce database and storage load.'
            : '',
    };
}

export function createStandDesignMaintenanceResponse(NextResponse) {
    const status = getStandDesignMaintenanceStatus();
    return NextResponse.json(
        {
            error: status.message || 'Stand Design heavy jobs are temporarily paused.',
            maintenance: status,
        },
        { status: 503 },
    );
}
