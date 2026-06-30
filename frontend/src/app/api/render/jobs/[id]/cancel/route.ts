export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': INTERNAL_KEY };
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${BACKEND_URL}/api/render/jobs/${params.id}/cancel`, { method: 'POST', headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
