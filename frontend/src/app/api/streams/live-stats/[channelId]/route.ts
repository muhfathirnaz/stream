export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const headers = { 'X-Internal-Key': INTERNAL_KEY };

export async function GET(_req: NextRequest, { params }: { params: { channelId: string } }) {
  const res = await fetch(`${BACKEND_URL}/api/streams/live-stats/${encodeURIComponent(params.channelId)}`, { headers, cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
