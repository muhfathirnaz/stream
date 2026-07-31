export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // We will use the existing /api/files/move endpoint in media-pool-server
    // Wait! The media-pool-server has:
    // app.post('/files/move', (req, res) => {
    //   const { type, oldCategory, newCategory, filename } = req.body;
    // ...
    
    // The NEXT_JS app is using the Express backend for thumbnails?
    // Wait, backend/src/routes/thumbnails.js doesn't have a /move endpoint,
    // BUT media-pool-server (running on port 3002) has /files/move !
    
    // Actually, where does media-pool-server run? PORT 3002!
    // But BACKEND_URL (port 3001) doesn't have it for thumbnails.
    // Let's implement it for BACKEND_URL (thumbnails).
    
    const backendRes = await fetch(`${BACKEND_URL}/api/thumbnails/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
