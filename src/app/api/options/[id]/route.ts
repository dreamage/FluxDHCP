import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db-instance';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const option = db.prepare('SELECT * FROM device_options WHERE id = ?').get(id);
    if (!option) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }
    return NextResponse.json(option);
  } catch (error) {
    console.error('[API] GET /options/:id:', error);
    return NextResponse.json({ error: 'Failed to fetch option' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();
    const { option_value, option_name } = body;

    const existing = db.prepare('SELECT * FROM device_options WHERE id = ?').get(id) as any;
    if (!existing) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    const newValue = option_value !== undefined ? String(option_value) : existing.option_value;
    // Validate option_value byte length (DHCP option length is 1 byte, max 255)
    if (Buffer.byteLength(newValue, 'utf8') > 255) {
      return NextResponse.json({ error: 'Option value exceeds 255 bytes' }, { status: 400 });
    }

    db.prepare('UPDATE device_options SET option_value = ?, option_name = ? WHERE id = ?').run(
      newValue,
      option_name !== undefined ? option_name : existing.option_name,
      id,
    );

    return NextResponse.json({ message: 'Option updated' });
  } catch (error) {
    console.error('[API] PUT /options/:id:', error);
    return NextResponse.json({ error: 'Failed to update option' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM device_options WHERE id = ?').run(id);
    if (result.changes === 0) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Option deleted' });
  } catch (error) {
    console.error('[API] DELETE /options/:id:', error);
    return NextResponse.json({ error: 'Failed to delete option' }, { status: 500 });
  }
}
