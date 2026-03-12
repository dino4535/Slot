import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const tblBayi = "['Bayi_Listesi']";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const territories = await query<{ TerritoryCode: string; Territory: string }>(`
      SELECT DISTINCT TerritoryCode, Territory
      FROM ${tblBayi}
      WHERE CustomerStatus = 'A'
      ORDER BY Territory
    `);

    return NextResponse.json(territories, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
