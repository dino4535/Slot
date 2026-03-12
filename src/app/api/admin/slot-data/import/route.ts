import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb, query } from '@/lib/db';
import mssql from 'mssql';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

const tblSlot = "['Slot_Data']";

type ImportError = { row: number; message: string };

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const y = String(parsed.y).padStart(4, '0');
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

  const m2 = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function quoteIdent(name: string) {
  return `[${name.replace(/]/g, ']]')}]`;
}

const TEXT_COLUMNS = new Set(
  [
    'CustomerCode',
    'CustomerName',
    'Territory',
    'TerritoryCode',
    'TerritoryAdı',
    'Region',
    'Zone',
    'Depo',
    'DEPO',
    'Sevkiyat_Deposu',
    'Mosaic',
    'TradeCategoryDescription',
    'SubTradeCategoryDescription',
    'AddressLevel2Description',
  ].map(x => x.toLowerCase())
);

function normalizeValue(columnName: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (!TEXT_COLUMNS.has(columnName.toLowerCase())) {
      const normalized = s.replace(/\./g, '').replace(',', '.');
      const n = Number(normalized);
      if (Number.isFinite(n)) return n;
    }
    return s;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    return toIsoDate(value);
  }
  return value;
}

async function getSlotDataColumns(): Promise<Map<string, string>> {
  const fromConst =
    tblSlot.startsWith('[') && tblSlot.endsWith(']') ? tblSlot.slice(1, -1) : tblSlot;
  const tableNames = Array.from(new Set(['Slot_Data', "'Slot_Data'", fromConst])).filter(Boolean);
  const placeholders = tableNames.map((_, i) => `@t${i}`).join(', ');
  const params: Record<string, unknown> = {};
  tableNames.forEach((n, i) => {
    params[`t${i}`] = n;
  });

  const rows = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (${placeholders}) ORDER BY ORDINAL_POSITION`,
    params
  );
  const map = new Map<string, string>();
  for (const r of rows) {
    const name = r.COLUMN_NAME;
    if (typeof name === 'string' && name.trim()) {
      map.set(name.trim().toLowerCase(), name.trim());
    }
  }
  return map;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Excel dosyası bulunamadı' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) {
      return NextResponse.json({ error: 'Excel içinde sayfa bulunamadı' }, { status: 400 });
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
    });
    if (!rows.length) {
      return NextResponse.json({ error: 'Excel içinde satır bulunamadı' }, { status: 400 });
    }

    const columnsMap = await getSlotDataColumns();
    if (!columnsMap.size) {
      return NextResponse.json({ error: 'Slot_Data kolonları okunamadı' }, { status: 500 });
    }

    const requiredCode = columnsMap.get('customercode');
    const requiredDate = columnsMap.get('date');
    if (!requiredCode || !requiredDate) {
      return NextResponse.json({ error: 'Slot_Data tablosunda CustomerCode/Date kolonları bulunamadı' }, { status: 500 });
    }

    const errors: ImportError[] = [];
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    const db = await getDb();
    const tx = new mssql.Transaction(db);
    await tx.begin();
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] ?? {};

        const normalizedPairs: Array<[string, unknown]> = [];
        for (const [rawKey, rawVal] of Object.entries(row)) {
          const key = String(rawKey ?? '').trim();
          if (!key) continue;
          const dbKey = columnsMap.get(key.toLowerCase());
          if (!dbKey) continue;
          normalizedPairs.push([dbKey, normalizeValue(dbKey, rawVal)]);
        }

        const record: Record<string, unknown> = Object.fromEntries(normalizedPairs);
        const customerCodeValue = record[requiredCode];
        const customerCode = customerCodeValue === null || customerCodeValue === undefined ? '' : String(customerCodeValue).trim();
        const dateValue = record[requiredDate];
        const date = toIsoDate(dateValue);

        if (!customerCode) {
          skipped++;
          errors.push({ row: i + 2, message: 'CustomerCode boş' });
          continue;
        }
        if (!date) {
          skipped++;
          errors.push({ row: i + 2, message: 'Date geçersiz/boş' });
          continue;
        }

        record[requiredCode] = customerCode;
        record[requiredDate] = date;

        const insertCols = Object.keys(record);
        const insertColSql = insertCols.map(quoteIdent).join(', ');
        const insertValSql = insertCols.map((_, idx) => `@p${idx}`).join(', ');

        const updateCols = insertCols.filter(c => c.toLowerCase() !== requiredCode.toLowerCase() && c.toLowerCase() !== requiredDate.toLowerCase());
        const updateSetSql = updateCols.map((c, idx) => `${quoteIdent(c)} = @u${idx}`).join(', ');
        const dateMatch = `CONVERT(date, ${quoteIdent(requiredDate)}) = CONVERT(date, @date)`;

        const sql = updateCols.length
          ? `
            IF EXISTS (SELECT 1 FROM ${tblSlot} WHERE ${quoteIdent(requiredCode)} = @customerCode AND ${dateMatch})
            BEGIN
              UPDATE ${tblSlot}
              SET ${updateSetSql}
              WHERE ${quoteIdent(requiredCode)} = @customerCode AND ${dateMatch};
              SELECT 'update' as action, @@ROWCOUNT as affected;
            END
            ELSE
            BEGIN
              INSERT INTO ${tblSlot} (${insertColSql}) VALUES (${insertValSql});
              SELECT 'insert' as action, @@ROWCOUNT as affected;
            END
          `
          : `
            IF EXISTS (SELECT 1 FROM ${tblSlot} WHERE ${quoteIdent(requiredCode)} = @customerCode AND ${dateMatch})
            BEGIN
              SELECT 'noop' as action, 0 as affected;
            END
            ELSE
            BEGIN
              INSERT INTO ${tblSlot} (${insertColSql}) VALUES (${insertValSql});
              SELECT 'insert' as action, @@ROWCOUNT as affected;
            END
          `;

        const req = new mssql.Request(tx);
        req.input('customerCode', customerCode);
        req.input('date', date);

        insertCols.forEach((c, idx) => {
          req.input(`p${idx}`, record[c] ?? null);
        });
        updateCols.forEach((c, idx) => {
          req.input(`u${idx}`, record[c] ?? null);
        });

        const result = await req.query(sql);
        const out = (result.recordset?.[0] as { action?: string; affected?: unknown } | undefined) ?? {};
        const action = String(out.action ?? 'noop').toLowerCase();
        const affected = Number(out.affected ?? 0);
        if (action === 'insert' && affected > 0) inserted++;
        else if (action === 'update' && affected > 0) updated++;
        else skipped++;
      }

      await tx.commit();
    } catch (e: unknown) {
      await tx.rollback();
      const message = e instanceof Error ? e.message : 'Unknown error';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted,
      updated,
      skipped,
      errors: errors.slice(0, 50),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
