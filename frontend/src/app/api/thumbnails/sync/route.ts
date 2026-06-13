// frontend/src/app/api/thumbnails/sync/route.ts
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';
const headers = { 'Content-Type': 'application/json', 'X-Internal-Key': INTERNAL_KEY };

export async function POST() {
  const res = await fetch(`${BACKEND_URL}/api/thumbnails/sync`, { method: 'POST', headers });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
