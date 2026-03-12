import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Get all columns from a row that has data
    const result = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ['Slot_Data']`);
    
    if (result.length > 0) {
      const columns = Object.keys(result[0]).map((key, index) => ({
        key,
        label: key,
        order: index
      }));
      
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
      
      return NextResponse.json({ success: true, columns });
    }
    return NextResponse.json({ error: 'No data found' }, { status: 404 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
