import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { columns } = body;
    
    // Get existing columns from DB
    const result = await query<Record<string, unknown>>(`SELECT TOP 1 * FROM ['Slot_Data']`);
    const existingColumns = result.length > 0 ? Object.keys(result[0]) : [];
    const newColumnKeys = columns.map((c: { key: string }) => c.key);
    
  let addedCount = 0;
  const errorMessages: string[] = [];
    
    // Add new columns to DB if they don't exist
    for (const columnName of newColumnKeys) {
      if (!existingColumns.includes(columnName)) {
        try {
          await query(`ALTER TABLE ['Slot_Data'] ADD [${columnName}] FLOAT NULL`);
          addedCount++;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          errorMessages.push(`${columnName}: ${message}`);
        }
      }
    }
    
    // Save to Settings
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
    
    let message = '';
    if (addedCount > 0) message += `${addedCount} kolon DB'ye eklendi. `;
    if (errorMessages.length > 0) message += 'Hatalar: ' + errorMessages.join('; ');
    if (message === '') message = 'Kolon ayarları kaydedildi!';
    
    return NextResponse.json({ success: true, message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
