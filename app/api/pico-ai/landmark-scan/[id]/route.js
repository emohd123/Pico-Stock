import { NextResponse } from 'next/server';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/lib/picoAi/core';
import { findLandmarkScanItem } from '@/lib/picoAi/landmarkScanCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function deviceType(userAgent) {
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) return 'tablet';
  if (/mobile|iphone|ipod|android/i.test(userAgent)) return 'mobile';
  if (userAgent) return 'desktop';
  return 'other';
}

export async function GET(request, { params }) {
  const landmark = findLandmarkScanItem(params.id);
  if (!landmark) return NextResponse.redirect(new URL('/landmarks', request.url), 302);

  const existing = request.cookies.get('pico-landmark-visitor')?.value;
  const visitor = /^[a-f0-9]{32}$/.test(existing || '') ? existing : randomBytes(16).toString('hex');
  const campaignRaw = new URL(request.url).searchParams.get('c') || 'bia-national-day';
  const campaign = /^[a-z0-9-]{1,40}$/.test(campaignRaw) ? campaignRaw : 'bia-national-day';
  const visitorHash = createHash('sha256').update(visitor).digest('hex');

  try {
    const scan = {
      landmark_id: landmark.id,
      visitor_hash: visitorHash,
      device_type: deviceType(request.headers.get('user-agent') || ''),
      campaign,
      scanned_at: new Date().toISOString(),
    };
    const client = db();
    const { error } = await client.from('pico_ai_landmark_scans').insert(scan);
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      const fallback = await client.from('pico_ai_internal').insert({
        name: `landmark_scan:${Date.now()}:${randomUUID()}`,
        value: JSON.stringify(scan),
      });
      if (fallback.error) console.error('Landmark QR fallback:', fallback.error.code, fallback.error.message);
    } else if (error) console.error('Landmark QR scan:', error.code, error.message);
  } catch (error) {
    console.error('Landmark QR scan:', error.message);
  }

  const response = NextResponse.redirect(new URL(`/landmarks/${landmark.id}`, request.url), 302);
  if (!existing) response.cookies.set('pico-landmark-visitor', visitor, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 180, path: '/' });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
