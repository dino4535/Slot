import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

type DashboardCard = {
  id?: string;
  label: string;
  numeratorKey: string;
  denominatorKey: string;
  multiplier?: number;
  decimals?: number;
  active?: boolean;
};

const defaultCards: DashboardCard[] = [
  {
    label: 'PM / Endüstri',
    numeratorKey: 'Total _Pm _Slot _Sayısı',
    denominatorKey: 'Endüstri _Slot',
    multiplier: 100,
    decimals: 2,
    active: true,
  },
  {
    label: 'Top3 / PM',
    numeratorKey: 'Total _Top3 _Sku _Slot _Sayısı',
    denominatorKey: 'Total _Pm _Slot _Sayısı',
    multiplier: 100,
    decimals: 2,
    active: true,
  },
];

export async function GET() {
  try {
    const settings = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'dashboardCards'`);
    if (settings.length > 0) {
      return NextResponse.json(JSON.parse(settings[0].SettingValue), { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
    }
    return NextResponse.json(defaultCards, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch {
    return NextResponse.json(defaultCards, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cards = Array.isArray(body?.cards) ? body.cards : [];
    const json = JSON.stringify(cards);
    const existing = await query(`SELECT * FROM Settings WHERE SettingKey = 'dashboardCards'`);
    if (existing.length > 0) {
      await query(`UPDATE Settings SET SettingValue = @value WHERE SettingKey = 'dashboardCards'`, { value: json });
    } else {
      await query(`INSERT INTO Settings (SettingKey, SettingValue) VALUES ('dashboardCards', @value)`, { value: json });
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
