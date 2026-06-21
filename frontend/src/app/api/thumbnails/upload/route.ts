export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Tidak ada file' }, { status: 400 });
    }

    const forwardForm = new FormData();
    forwardForm.append('file', file, file.name);

    const res = await fetch(`${BACKEND_URL}/api/thumbnails/upload`, {
      method: 'POST',
      headers: {
        'X-Internal-Key': INTERNAL_KEY,
      },
      body: forwardForm,
    });

    const text = await res.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      console.error('[thumbnails/upload] Backend non-JSON:', text.slice(0, 300));
      return NextResponse.json(
        { error: `Backend error: ${res.status}` },
        { status: res.status || 500 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
