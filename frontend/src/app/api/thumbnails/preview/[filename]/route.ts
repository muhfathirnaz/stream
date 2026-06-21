export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';

export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } }
) {
  const res = await fetch(
    `${BACKEND_URL}/api/thumbnails/preview/${encodeURIComponent(params.filename)}`,
    { headers: { 'X-Internal-Key': INTERNAL_KEY } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') || 'image/jpeg';

  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}
