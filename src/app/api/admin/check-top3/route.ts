import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const KNOWN_META_KEYS = new Set([
  'CustomerCode',
  'CustomerName',
  'Territory',
  'TerritoryCode',
  'TerritoryAdı',
  'Region',
  'Zone',
  'Date',
  'aa',
  'Mosaic',
  'MP',
  'TradeCategoryDescription',
  'SubTradeCategoryDescription',
  'AddressLevel2Description',
  'SonGuncelleme',
  'SonSlot',
  'DEPO',
  'Sevkiyat_Deposu',
  // Aggregates to exclude from per-SKU scan
  'Endüstri _Slot',
  'Total _Pm _Slot _Sayısı',
  'Total _Top3 _Sku _Slot _Sayısı',
  'Total_Stratejik_SKU_Slot_Sayısı',
]);

function numericColumnsOf(row: Record<string, unknown>) {
  const entries: Array<{ key: string; value: number }> = [];
  for (const [k, v] of Object.entries(row)) {
    if (KNOWN_META_KEYS.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) {
      entries.push({ key: k, value: v });
    }
  }
  return entries;
}

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
    const customer = searchParams.get('customer');
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit') || '10', 10)));

    let rows: Array<Record<string, unknown>> = [];
    if (customer) {
      rows = await query<Record<string, unknown>>(
        `SELECT TOP (@limit) * FROM vw_BayiSonVeri WHERE CustomerCode = @customer ORDER BY Date DESC`,
        { customer, limit }
      );
    } else {
      rows = await query<Record<string, unknown>>(
        `SELECT TOP (@limit) * FROM vw_BayiSonVeri ORDER BY Date DESC`,
        { limit }
      );
    }

    const results: Array<{
      CustomerCode?: string;
      Date?: string;
      reportedTop3?: number | null;
      computedTop3?: number;
      top3Breakdown?: Array<{ key: string; value: number }>;
      ok: boolean;
    }> = [];

    for (const r of rows) {
      const numericCols = numericColumnsOf(r);
      numericCols.sort((a, b) => b.value - a.value);
      const top3 = numericCols.slice(0, 3);
      const computed = top3.reduce((s, x) => s + (x.value || 0), 0);
      const reported = (r['Total _Top3 _Sku _Slot _Sayısı'] as number) ?? null;
      results.push({
        CustomerCode: String(r['CustomerCode'] ?? ''),
        Date: String(r['Date'] ?? ''),
        reportedTop3: reported,
        computedTop3: computed,
        top3Breakdown: top3,
        ok: reported !== null && Math.abs(computed - reported) < 1e-6,
      });
    }

    const total = results.length;
    const okCount = results.filter(x => x.ok).length;
    const mismatchCount = total - okCount;

    return NextResponse.json({
      ok: true,
      total,
      okCount,
      mismatchCount,
      rows: results,
      note: 'Top3, satırdaki SKU sütunlarından en yüksek 3 değerin toplamı olarak hesaplandı.',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
