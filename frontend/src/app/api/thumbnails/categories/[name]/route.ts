export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': INTERNAL_KEY };

export async function GET() {
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/categories`, { headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/categories`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest, { params }: { params: { name: string } }) {
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/categories/${encodeURIComponent(params.name)}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: { name: string } }) {
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/categories/${encodeURIComponent(params.name)}`, {
    method: 'DELETE', headers,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}