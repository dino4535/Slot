import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const tblBayi = "['Bayi_Listesi']";
const tblSlot = "['Slot_Data']";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const yearsSetting = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    const parsedYears = yearsSetting.length > 0 ? ((): { baselineYear?: unknown; targetYear?: unknown } => {
      try { return JSON.parse(yearsSetting[0].SettingValue); } catch { return {}; }
    })() : {};
    const targetYear = Number.isFinite(Number(parsedYears.targetYear)) ? Math.trunc(Number(parsedYears.targetYear)) : 2026;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const user = session.user as { territoryCode?: string; territoryCodes?: string[]; role?: string };
    const territoryCode = user.territoryCode;
    const territoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);
    const role = user.role;

    let whereClause = 'WHERE bl.CustomerStatus = \'A\'';
    const params: Record<string, unknown> = { limit, offset, targetYear };

    if (role !== 'admin') {
      const codes = territoryCodes.length ? territoryCodes : (territoryCode ? [territoryCode] : []);
      if (codes.length === 0) {
        return NextResponse.json({ error: 'Territory ataması yok' }, { status: 403 });
      }
      const placeholders: string[] = [];
      for (let i = 0; i < codes.length; i++) {
        const k = `t${i}`;
        placeholders.push(`@${k}`);
        params[k] = codes[i];
      }
      whereClause += ` AND bl.TerritoryCode IN (${placeholders.join(', ')})`;
    }

    if (search) {
      whereClause += whereClause ? ' AND ' : 'WHERE ';
      whereClause += '(LOWER(bl.CustomerName) LIKE LOWER(@search) OR LOWER(bl.CustomerCode) LIKE LOWER(@search))';
      params.search = `%${search}%`;
    }

    const bayiler = await query(`
      WITH y AS (
        SELECT
          CustomerCode,
          MAX(CASE WHEN YEAR(Date) = @targetYear THEN 1 ELSE 0 END) AS HasTargetYear
        FROM ${tblSlot}
        GROUP BY CustomerCode
      ),
      latest AS (
        SELECT
          CustomerCode,
          Date,
          [Total _Pm _Slot _Sayısı],
          ROW_NUMBER() OVER (PARTITION BY CustomerCode ORDER BY Date DESC) AS rn
        FROM ${tblSlot}
      )
      SELECT 
        bl.*,
        sd.Date as SonGuncelleme,
        sd.[Total _Pm _Slot _Sayısı] as SonSlot,
        COALESCE(y.HasTargetYear, 0) AS Has2026
      FROM ${tblBayi} bl
      LEFT JOIN latest sd ON bl.CustomerCode = sd.CustomerCode AND sd.rn = 1
      LEFT JOIN y ON y.CustomerCode = bl.CustomerCode
      ${whereClause}
      ORDER BY bl.CustomerName
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, params);

    const countQuery = `SELECT COUNT(*) as total FROM ${tblBayi} bl ${whereClause}`;
    const countResult = await query<{ total: number }>(countQuery, params);
    const total = countResult[0]?.total || 0;

    return NextResponse.json({
      bayiler,
      targetYear,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Bayi list error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
