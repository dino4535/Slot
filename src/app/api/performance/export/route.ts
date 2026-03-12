import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const tblBayi = "['Bayi_Listesi']";
const tblSlot = "['Slot_Data']";
const vwAfter = 'vw_BayiSonVeri';

type CardDef = {
  label: string;
  numeratorKey?: string;
  denominatorKey?: string;
  numeratorKeys?: string[];
  denominatorKeys?: string[];
  multiplier?: number;
  decimals?: number;
  active?: boolean;
};

type Years = { baselineYear: number; targetYear: number };

function parseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeYears(input: unknown): Years {
  const obj = (typeof input === 'object' && input) ? (input as Record<string, unknown>) : {};
  const baselineYear = Number(obj.baselineYear);
  const targetYear = Number(obj.targetYear);
  return {
    baselineYear: Number.isFinite(baselineYear) ? Math.trunc(baselineYear) : 2025,
    targetYear: Number.isFinite(targetYear) ? Math.trunc(targetYear) : 2026,
  };
}

const esc = (s: string) => s.replace(/]/g, '');
const toKeys = (one?: string, many?: string[]) => {
  if (Array.isArray(many) && many.length > 0) return many;
  if (typeof one === 'string' && one.trim()) return one.split(',').map(x => x.trim()).filter(Boolean);
  return [];
};

function sumExpr(alias: string, keys: string[]) {
  if (keys.length === 0) return '0';
  return keys.map(k => `COALESCE(CAST(${alias}.[${esc(k)}] AS FLOAT), 0)`).join(' + ');
}

function csvEscape(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value);
  const needs = /[",\n\r]/.test(s);
  return needs ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as { territoryCode?: string; territoryCodes?: string[]; role?: string };
    const role = user.role;
    const userTerritoryCode = user.territoryCode;
    const userTerritoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const cardLabel = url.searchParams.get('card') || '';
    const territoryParam = url.searchParams.get('territoryCode') || '';

    const yearsSetting = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    const years = yearsSetting.length > 0 ? normalizeYears(parseJson<unknown>(yearsSetting[0].SettingValue)) : { baselineYear: 2025, targetYear: 2026 };

    const settings = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'dashboardCards'`);
    const defs: CardDef[] = settings.length > 0 ? (parseJson<CardDef[]>(settings[0].SettingValue) || []) : [];
    const activeDefs = defs.filter(d => d?.active !== false);
    const selected = activeDefs.find(d => d.label === cardLabel) || activeDefs[0];
    if (!selected) {
      return NextResponse.json({ error: 'Kart tanımı yok' }, { status: 400 });
    }

    const numKeys = toKeys(selected.numeratorKey, selected.numeratorKeys);
    const denKeys = toKeys(selected.denominatorKey, selected.denominatorKeys);
    const multiplier = selected.multiplier ?? 1;

    const territoryCodesUsed = role === 'admin'
      ? []
      : (userTerritoryCodes.length ? userTerritoryCodes : (userTerritoryCode ? [userTerritoryCode] : []));
    const territoryCodeUsed = role === 'admin'
      ? (territoryParam || null)
      : (territoryParam && territoryCodesUsed.includes(territoryParam) ? territoryParam : null);

    const whereParts: string[] = [`bl.CustomerStatus = 'A'`];
    const params: Record<string, unknown> = {
      baselineYear: years.baselineYear,
      targetYear: years.targetYear,
      multiplier,
    };

    const allowedPlaceholders: string[] = [];
    if (role !== 'admin') {
      if (territoryCodesUsed.length === 0) {
        return NextResponse.json({ error: 'Territory ataması yok' }, { status: 403 });
      }
      for (let i = 0; i < territoryCodesUsed.length; i++) {
        const k = `t${i}`;
        allowedPlaceholders.push(`@${k}`);
        params[k] = territoryCodesUsed[i];
      }
    }

    if (territoryCodeUsed) {
      whereParts.push('bl.TerritoryCode = @territoryCode');
      params.territoryCode = territoryCodeUsed;
    }
    if (!territoryCodeUsed && role !== 'admin') {
      whereParts.push(`bl.TerritoryCode IN (${allowedPlaceholders.join(', ')})`);
    }
    if (search) {
      whereParts.push('(bl.CustomerName LIKE @search OR bl.CustomerCode LIKE @search)');
      params.search = `%${search}%`;
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const rows = await query<Record<string, unknown> & {
      CustomerCode: string;
      CustomerName: string;
      Territory: string;
      TerritoryCode: string;
      BeforeDate: string | null;
      AfterDate: string | null;
      BeforeValue: number | null;
      AfterValue: number | null;
      HasTargetYear: number;
    }>(`
      WITH y AS (
        SELECT CustomerCode, 1 AS HasTargetYear
        FROM ${tblSlot}
        WHERE YEAR(Date) = @targetYear
        GROUP BY CustomerCode
      )
      SELECT
        bl.CustomerCode,
        bl.CustomerName,
        bl.Territory,
        bl.TerritoryCode,
        b.Date AS BeforeDate,
        a.Date AS AfterDate,
        CASE
          WHEN (${sumExpr('b', denKeys)}) = 0 THEN NULL
          ELSE ((${sumExpr('b', numKeys)}) / NULLIF((${sumExpr('b', denKeys)}), 0)) * @multiplier
        END AS BeforeValue,
        CASE
          WHEN a.CustomerCode IS NULL THEN NULL
          WHEN (${sumExpr('a', denKeys)}) = 0 THEN NULL
          ELSE ((${sumExpr('a', numKeys)}) / NULLIF((${sumExpr('a', denKeys)}), 0)) * @multiplier
        END AS AfterValue,
        CASE WHEN y.CustomerCode IS NULL THEN 0 ELSE 1 END AS HasTargetYear
      FROM ${tblBayi} bl
      OUTER APPLY (
        SELECT TOP 1 *
        FROM ${tblSlot} bx
        WHERE bx.CustomerCode = bl.CustomerCode AND YEAR(bx.Date) = @baselineYear
        ORDER BY bx.Date DESC
      ) b
      LEFT JOIN ${vwAfter} a
        ON a.CustomerCode = bl.CustomerCode
      LEFT JOIN y
        ON y.CustomerCode = bl.CustomerCode
      ${whereClause}
      ORDER BY bl.CustomerName
    `, params);

    const header = [
      'TerritoryCode',
      'Territory',
      'CustomerCode',
      'CustomerName',
      `BeforeDate(${years.baselineYear})`,
      'AfterDate(Guncel)',
      `BeforeValue(${selected.label})`,
      `AfterValue(${selected.label})`,
      'Delta',
      `${years.targetYear}VarMi`,
    ];

    const lines = [
      header.map(csvEscape).join(','),
      ...rows.map(r => [
        r.TerritoryCode,
        r.Territory,
        r.CustomerCode,
        r.CustomerName,
        r.BeforeDate,
        r.AfterDate,
        r.BeforeValue,
        r.AfterValue,
        (r.BeforeValue !== null && r.AfterValue !== null) ? (r.AfterValue - r.BeforeValue) : null,
        r.HasTargetYear === 1 ? 'Evet' : 'Hayır',
      ].map(csvEscape).join(',')),
    ];

    const csv = lines.join('\n');
    const filename = `performans_${selected.label}_${years.baselineYear}_to_guncel.csv`.replace(/[^\w.\-]+/g, '_');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
