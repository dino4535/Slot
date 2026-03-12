import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const tblBayi = "['Bayi_Listesi']";
const tblSlot = "['Slot_Data']";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await context.params;
    const customerCode = id;

    const user = session.user as { territoryCode?: string; territoryCodes?: string[]; role?: string };
    const territoryCode = user.territoryCode;
    const territoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);
    const role = user.role;

    const accessWhereParts = ['CustomerCode = @customerCode'];
    const accessParams: Record<string, unknown> = { customerCode };
    if (role !== 'admin') {
      const codes = territoryCodes.length ? territoryCodes : (territoryCode ? [territoryCode] : []);
      if (codes.length === 0) {
        return NextResponse.json({ error: 'Territory ataması yok' }, { status: 403 });
      }
      const placeholders: string[] = [];
      for (let i = 0; i < codes.length; i++) {
        const k = `t${i}`;
        placeholders.push(`@${k}`);
        accessParams[k] = codes[i];
      }
      accessWhereParts.push(`TerritoryCode IN (${placeholders.join(', ')})`);
    }

    const accessCheck = await query(
      `SELECT * FROM ${tblBayi} WHERE ${accessWhereParts.join(' AND ')}`,
      accessParams
    );
    if (accessCheck.length === 0) {
      return NextResponse.json({ error: 'Bu bayiye erişim yetkiniz yok' }, { status: 403 });
    }

    const yearsSetting = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    const parsedYears = yearsSetting.length > 0 ? ((): { baselineYear?: unknown } => {
      try { return JSON.parse(yearsSetting[0].SettingValue); } catch { return {}; }
    })() : {};
    const year = Number.isFinite(Number(parsedYears.baselineYear)) ? Math.trunc(Number(parsedYears.baselineYear)) : 2025;

    const rows = await query<Record<string, unknown>>(`
      SELECT TOP 1 *
      FROM ${tblSlot}
      WHERE CustomerCode = @customerCode AND YEAR(Date) = @year
      ORDER BY Date DESC
    `, { customerCode, year });
    const baseline = rows[0] || null;
    return NextResponse.json({ baseline, year });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
