import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

const defaultColumns = [
  { key: 'Total _Pm _Slot _Sayısı', label: 'Toplam PM Slot', order: 0 },
  { key: 'Total _Top3 _Sku _Slot _Sayısı', label: 'Top3 SKU Slot', order: 1 },
  { key: 'Total_Stratejik_SKU_Slot_Sayısı', label: 'Stratejik SKU', order: 2 },
  { key: 'Endüstri _Slot', label: 'Endüstri Slot', order: 3 },
  { key: 'J _Firma Slot Sayısı', label: 'J Firma Slot', order: 4 },
  { key: 'B _Firma Slot Sayısı', label: 'B Firma Slot', order: 5 },
  { key: 'CHMODENAVY', label: 'CHMODENAVY', order: 6 },
  { key: 'CHNAVYBRCB', label: 'CHNAVYBRCB', order: 7 },
  { key: 'CHNB100RCB', label: 'CHNB100RCB', order: 8 },
  { key: 'LAB100RCB', label: 'LAB100RCB', order: 9 },
  { key: 'LARKBRCB', label: 'LARKBRCB', order: 10 },
  { key: 'LM100RCB', label: 'LM100RCB', order: 11 },
  { key: 'LMRCB', label: 'LMRCB', order: 12 },
  { key: 'MFTB', label: 'MFTB', order: 13 },
  { key: 'MLEDBLUE', label: 'MLEDBLUE', order: 14 },
  { key: 'MLEDGE', label: 'MLEDGE', order: 15 },
  { key: 'MLEDSKY', label: 'MLEDSKY', order: 16 },
  { key: 'MLEDSLIMS', label: 'MLEDSLIMS', order: 17 },
  { key: 'MLFTB', label: 'MLFTB', order: 18 },
  { key: 'MLR100', label: 'MLR100', order: 19 },
  { key: 'MLROLL50', label: 'MLROLL50', order: 20 },
  { key: 'MLRTGRAYRCB', label: 'MLRTGRAYRCB', order: 21 },
  { key: 'MLTBLUE', label: 'MLTBLUE', order: 22 },
  { key: 'MLTGRAY', label: 'MLTGRAY', order: 23 },
  { key: 'MLTONE', label: 'MLTONE', order: 24 },
  { key: 'MUABLU', label: 'MUABLU', order: 25 },
  { key: 'MUARCB', label: 'MUARCB', order: 26 },
  { key: 'PL100', label: 'PL100', order: 27 },
  { key: 'PLABS100', label: 'PLABS100', order: 28 },
  { key: 'PLLONGRCB', label: 'PLLONGRCB', order: 29 },
  { key: 'PLLRC', label: 'PLLRC', order: 30 },
  { key: 'PLMNRCB', label: 'PLMNRCB', order: 31 },
  { key: 'PLRC', label: 'PLRC', order: 32 },
  { key: 'PLRSVRCB', label: 'PLRSVRCB', order: 33 },
];

export async function GET() {
  try {
    interface Setting {
      SettingKey: string;
      SettingValue: string;
    }
    const settings = await query<Setting>(`SELECT * FROM Settings WHERE SettingKey = 'slotColumns'`);
    
    if (settings.length > 0) {
      return NextResponse.json(JSON.parse(settings[0].SettingValue), {
        headers: { 'Cache-Control': 'no-store, must-revalidate' },
      });
    }
    
    return NextResponse.json(defaultColumns, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  } catch {
    return NextResponse.json(defaultColumns, {
      headers: { 'Cache-Control': 'no-store, must-revalidate' },
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { columns } = body;
    
    const columnsJson = JSON.stringify(columns);
    
    const existing = await query(`SELECT * FROM Settings WHERE SettingKey = 'slotColumns'`);
    
    if (existing.length > 0) {
      await query(
        `UPDATE Settings SET SettingValue = @value WHERE SettingKey = 'slotColumns'`,
        { value: columnsJson }
      );
    } else {
      await query(
        `INSERT INTO Settings (SettingKey, SettingValue) VALUES ('slotColumns', @value)`,
        { value: columnsJson }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
