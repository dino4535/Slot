import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as { role?: string })?.role;
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === '1';
    const limit = Math.max(1, Math.min(1000, parseInt(searchParams.get('limit') || '50', 10)));

    if (full) {
      const totals = await query<{ total: number; inView: number; matched: number; mismatched: number }>(`
        WITH sd AS (
          SELECT CustomerCode, MAX(Date) AS MaxDate
          FROM ['Slot_Data']
          GROUP BY CustomerCode
        )
        SELECT 
          COUNT_BIG(*) AS total,
          SUM(CASE WHEN v.CustomerCode IS NOT NULL THEN 1 ELSE 0 END) AS inView,
          SUM(CASE WHEN v.Date = sd.MaxDate THEN 1 ELSE 0 END) AS matched,
          SUM(CASE WHEN v.Date IS NULL OR v.Date <> sd.MaxDate THEN 1 ELSE 0 END) AS mismatched
        FROM sd
        LEFT JOIN vw_BayiSonVeri v
          ON v.CustomerCode = sd.CustomerCode
      `);
      
      const mismatches = await query<{ CustomerCode: string; MaxDate: string | null; ViewDate: string | null }>(`
        WITH sd AS (
          SELECT CustomerCode, MAX(Date) AS MaxDate
          FROM ['Slot_Data']
          GROUP BY CustomerCode
        )
        SELECT TOP (@limit)
          sd.CustomerCode,
          sd.MaxDate,
          v.Date AS ViewDate
        FROM sd
        LEFT JOIN vw_BayiSonVeri v
          ON v.CustomerCode = sd.CustomerCode
        WHERE v.Date IS NULL OR v.Date <> sd.MaxDate
        ORDER BY sd.MaxDate DESC
      `, { limit });
      
      return NextResponse.json({
        ok: true,
        mode: 'full',
        totals: totals[0] || { total: 0, inView: 0, matched: 0, mismatched: 0 },
        mismatchesCount: mismatches.length,
        mismatches,
      });
    }

    const countRows = await query<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM vw_BayiSonVeri`);
    const count = countRows[0]?.cnt ?? 0;

    const samples = await query<{ CustomerCode: string; Date: string }>(`
      SELECT TOP 10 CustomerCode, Date
      FROM vw_BayiSonVeri
      ORDER BY Date DESC
    `);

    const mismatches: Array<{ customerCode: string; viewDate: string | null; maxDate: string | null }> = [];
    for (const s of samples) {
      const maxRows = await query<{ maxDate: string | null }>(
        `SELECT MAX(Date) as maxDate FROM ['Slot_Data'] WHERE CustomerCode = @code`,
        { code: s.CustomerCode }
      );
      const maxDate = maxRows[0]?.maxDate ?? null;
      const viewDate = s.Date ?? null;
      if (String(maxDate) !== String(viewDate)) {
        mismatches.push({ customerCode: s.CustomerCode, viewDate, maxDate });
      }
    }

    const sampleAny = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM vw_BayiSonVeri ORDER BY Date DESC`);
    const columns = sampleAny.length > 0 ? Object.keys(sampleAny[0]) : [];

    return NextResponse.json({ ok: true, mode: 'sample', count, columns, samples, mismatchesCount: mismatches.length, mismatches });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
