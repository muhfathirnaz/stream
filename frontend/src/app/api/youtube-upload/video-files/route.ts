export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
export async function GET() {
  const res = await fetch(`${BACKEND_URL}/api/youtube-upload/video-files`, {
    headers: { 'X-Internal-Key': INTERNAL_KEY }, cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
