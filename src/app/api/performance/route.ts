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
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;
    const cardLabel = url.searchParams.get('card') || '';
    const territoryParam = url.searchParams.get('territoryCode') || '';

    const yearsSetting = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    const years = yearsSetting.length > 0 ? normalizeYears(parseJson<unknown>(yearsSetting[0].SettingValue)) : { baselineYear: 2025, targetYear: 2026 };

    const settings = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'dashboardCards'`);
    const defs: CardDef[] = settings.length > 0 ? (parseJson<CardDef[]>(settings[0].SettingValue) || []) : [];
    const activeDefs = defs.filter(d => d?.active !== false);
    const selected = activeDefs.find(d => d.label === cardLabel) || activeDefs[0];

    if (!selected) {
      return NextResponse.json({
        baselineYear: years.baselineYear,
        targetYear: years.targetYear,
        cardLabels: [],
        selectedCard: null,
        territories: role === 'admin' ? [] : undefined,
        rows: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        summary: {
          beforeValue: null,
          afterValue: null,
          delta: null,
          totalBayiler: 0,
          missingBaseline: 0,
          missingAfter: 0,
          missingTargetYear: 0,
        },
      });
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
      limit,
      offset,
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

    const countResult = await query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM ${tblBayi} bl
      ${whereClause}
    `, params);
    const total = countResult[0]?.total || 0;

    const rows = await query<Record<string, unknown> & {
      CustomerCode: string;
      CustomerName: string;
      Territory: string;
      TerritoryCode: string;
      BeforeDate: string | null;
      AfterDate: string | null;
      BeforeNum: number | null;
      BeforeDen: number | null;
      BeforeValue: number | null;
      AfterNum: number | null;
      AfterDen: number | null;
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
        (${sumExpr('b', numKeys)}) AS BeforeNum,
        (${sumExpr('b', denKeys)}) AS BeforeDen,
        CASE
          WHEN (${sumExpr('b', denKeys)}) = 0 THEN NULL
          ELSE ((${sumExpr('b', numKeys)}) / NULLIF((${sumExpr('b', denKeys)}), 0)) * @multiplier
        END AS BeforeValue,
        (${sumExpr('a', numKeys)}) AS AfterNum,
        (${sumExpr('a', denKeys)}) AS AfterDen,
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
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, params);

    const summaryAgg = await query<{
      totalBayiler: number;
      missingBaseline: number;
      missingAfter: number;
      missingTargetYear: number;
      beforeNum: number;
      beforeDen: number;
      afterNum: number;
      afterDen: number;
    }>(`
      WITH y AS (
        SELECT CustomerCode, 1 AS HasTargetYear
        FROM ${tblSlot}
        WHERE YEAR(Date) = @targetYear
        GROUP BY CustomerCode
      )
      SELECT
        COUNT(*) AS totalBayiler,
        SUM(CASE WHEN b.Date IS NULL THEN 1 ELSE 0 END) AS missingBaseline,
        SUM(CASE WHEN a.CustomerCode IS NULL THEN 1 ELSE 0 END) AS missingAfter,
        SUM(CASE WHEN y.CustomerCode IS NULL THEN 1 ELSE 0 END) AS missingTargetYear,
        SUM(CASE WHEN b.Date IS NULL THEN 0 ELSE (${sumExpr('b', numKeys)}) END) AS beforeNum,
        SUM(CASE WHEN b.Date IS NULL THEN 0 ELSE (${sumExpr('b', denKeys)}) END) AS beforeDen,
        SUM(CASE WHEN a.CustomerCode IS NULL THEN 0 ELSE (${sumExpr('a', numKeys)}) END) AS afterNum,
        SUM(CASE WHEN a.CustomerCode IS NULL THEN 0 ELSE (${sumExpr('a', denKeys)}) END) AS afterDen
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
    `, params);

    const summary = summaryAgg[0] ?? {
      totalBayiler: 0,
      missingBaseline: 0,
      missingAfter: 0,
      missingTargetYear: 0,
      beforeNum: 0,
      beforeDen: 0,
      afterNum: 0,
      afterDen: 0,
    };

    const beforeValue = summary.beforeDen ? (summary.beforeNum / summary.beforeDen) * multiplier : null;
    const afterValue = summary.afterDen ? (summary.afterNum / summary.afterDen) * multiplier : null;
    const delta = beforeValue !== null && afterValue !== null ? afterValue - beforeValue : null;

    const territories = role === 'admin'
      ? await query<{ TerritoryCode: string; Territory: string }>(`
          SELECT DISTINCT TerritoryCode, Territory
          FROM ${tblBayi}
          WHERE CustomerStatus = 'A'
          ORDER BY Territory
        `)
      : await query<{ TerritoryCode: string; Territory: string }>(`
          SELECT DISTINCT TerritoryCode, Territory
          FROM ${tblBayi}
          WHERE CustomerStatus = 'A' AND TerritoryCode IN (${allowedPlaceholders.join(', ')})
          ORDER BY Territory
        `, params);

    return NextResponse.json({
      baselineYear: years.baselineYear,
      targetYear: years.targetYear,
      cardLabels: activeDefs.map(d => d.label),
      selectedCard: { label: selected.label, decimals: selected.decimals ?? 2, multiplier },
      territoryCode: territoryCodeUsed,
      territories,
      rows: rows.map(r => ({
        CustomerCode: r.CustomerCode,
        CustomerName: r.CustomerName,
        Territory: r.Territory,
        TerritoryCode: r.TerritoryCode,
        BeforeDate: r.BeforeDate,
        AfterDate: r.AfterDate,
        BeforeValue: r.BeforeValue,
        AfterValue: r.AfterValue,
        Delta: r.BeforeValue !== null && r.AfterValue !== null ? r.AfterValue - r.BeforeValue : null,
        HasTargetYear: r.HasTargetYear,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        beforeValue,
        afterValue,
        delta,
        totalBayiler: summary.totalBayiler,
        missingBaseline: summary.missingBaseline,
        missingAfter: summary.missingAfter,
        missingTargetYear: summary.missingTargetYear,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
