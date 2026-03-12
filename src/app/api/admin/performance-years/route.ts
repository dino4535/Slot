import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

type Years = { baselineYear: number; targetYear: number };

const DEFAULT_YEARS: Years = { baselineYear: 2025, targetYear: 2026 };

function normalizeYears(input: unknown): Years {
  const obj = (typeof input === 'object' && input) ? (input as Record<string, unknown>) : {};
  const baselineYear = Number(obj.baselineYear);
  const targetYear = Number(obj.targetYear);
  return {
    baselineYear: Number.isFinite(baselineYear) ? Math.trunc(baselineYear) : DEFAULT_YEARS.baselineYear,
    targetYear: Number.isFinite(targetYear) ? Math.trunc(targetYear) : DEFAULT_YEARS.targetYear,
  };
}

export async function GET() {
  try {
    const settings = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    if (settings.length > 0) {
      return NextResponse.json(normalizeYears(JSON.parse(settings[0].SettingValue)), {
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      });
    }
    return NextResponse.json(DEFAULT_YEARS, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch {
    return NextResponse.json(DEFAULT_YEARS, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const years = normalizeYears(body);
    const json = JSON.stringify(years);

    const existing = await query(`SELECT * FROM Settings WHERE SettingKey = 'performanceYears'`);
    if (existing.length > 0) {
      await query(`UPDATE Settings SET SettingValue = @value WHERE SettingKey = 'performanceYears'`, { value: json });
    } else {
      await query(`INSERT INTO Settings (SettingKey, SettingValue) VALUES ('performanceYears', @value)`, { value: json });
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
