// frontend/src/app/api/thumbnails/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    // Forward multipart langsung ke backend as-is
    const body = await req.blob();

    const res = await fetch(`${BACKEND_URL}/api/thumbnails/upload`, {
      method: 'POST',
      headers: {
        'X-Internal-Key': INTERNAL_KEY,
        'Content-Type': req.headers.get('content-type') || '',
      },
      body,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}