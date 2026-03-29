import nextDynamic from 'next/dynamic';

const StandDesign3DEditor = nextDynamic(
    () => import('@/components/stand-design/3d/StandDesign3DEditor'),
    {
        ssr: false,
        loading: () => (
            <div className="stand-design-3d-page">
                <div className="stand-design-3d-shell">
                    <div className="stand-design-editor-empty">Loading 3D editor...</div>
                </div>
            </div>
        ),
    },
);

export const dynamic = 'force-dynamic';

export default function StandDesign3DPage({ params, searchParams }) {
    const conceptIndex = Number(searchParams?.concept) === 1 ? 1 : 0;
    return <StandDesign3DEditor recordId={params.id} initialConceptIndex={conceptIndex} />;
}
