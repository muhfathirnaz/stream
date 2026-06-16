import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': INTERNAL_KEY };

export async function DELETE(_req: NextRequest, { params }: { params: { name: string } }) {
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/categories/${encodeURIComponent(params.name)}`, {
    method: 'DELETE', headers,
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
