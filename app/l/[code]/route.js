import { NextResponse } from 'next/server';
import { findLandmarkScanReference } from '@/lib/picoAi/landmarkScanCatalog';

export const dynamic = 'force-dynamic';

// Stable short URLs keep printed QR codes less dense while preserving scan reports.
export async function GET(request, { params }) {
  const landmark = findLandmarkScanReference(params.code);
  if (!landmark) {
    return new Response('Landmark not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const destination = new URL(`/api/pico-ai/landmark-scan/${landmark.id}`, request.url);
  const response = NextResponse.redirect(destination, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
