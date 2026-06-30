export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const res = await fetch(`${BACKEND_URL}/api/render/lyrics/upload`, {
    method: 'POST',
    headers: { 'X-Internal-Key': INTERNAL_KEY },
    body: formData,
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Backend non-JSON response' }, { status: 500 });
  }
}
