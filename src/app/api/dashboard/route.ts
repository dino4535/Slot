import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import type { RecentUpdate, DashboardStats } from '@/types';

const tblBayi = "['Bayi_Listesi']";
const tblSlot = "['Slot_Data']";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as { territoryCode?: string; territoryCodes?: string[]; role?: string };
    const territoryCode = user.territoryCode;
    const territoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);
    const role = user.role;

    const codes = role === 'admin' ? [] : (territoryCodes.length ? territoryCodes : (territoryCode ? [territoryCode] : []));
    if (role !== 'admin' && codes.length === 0) {
      return NextResponse.json({ error: 'Territory ataması yok' }, { status: 403 });
    }
    const terrParams: Record<string, unknown> = {};
    const terrPlaceholders: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      const k = `t${i}`;
      terrParams[k] = codes[i];
      terrPlaceholders.push(`@${k}`);
    }
    const blTerrFilter = terrPlaceholders.length ? `bl.TerritoryCode IN (${terrPlaceholders.join(', ')})` : '';
    const sdTerrFilter = terrPlaceholders.length ? `sd.Territory IN (${terrPlaceholders.join(', ')})` : '';

    let stats: Partial<DashboardStats> = {};

    if (role === 'admin') {
      const total = await query(`
        SELECT 
          (SELECT COUNT(DISTINCT CustomerCode) FROM ${tblBayi} WHERE CustomerStatus = 'A') as totalBayi,
          (SELECT COUNT(DISTINCT CustomerCode) FROM ${tblSlot}) as kayitliBayi,
          (SELECT MAX(Date) FROM ${tblSlot}) as sonGuncelleme,
          (SELECT AVG(CAST([Total _Pm _Slot _Sayısı] AS FLOAT)) FROM vw_BayiSonVeri) as ortalamaSlot
      `);
      stats = total[0] as DashboardStats;
    } else {
      const terrStats = await query<DashboardStats>(`
        SELECT 
          COUNT(DISTINCT bl.CustomerCode) as totalBayi,
          COUNT(DISTINCT sd.CustomerCode) as kayitliBayi,
          MAX(sd.Date) as sonGuncelleme,
          AVG(CAST(sd.[Total _Pm _Slot _Sayısı] AS FLOAT)) as ortalamaSlot
        FROM ${tblBayi} bl
        LEFT JOIN ${tblSlot} sd ON bl.CustomerCode = sd.CustomerCode
        WHERE ${blTerrFilter} AND bl.CustomerStatus = 'A'
      `, terrParams);
      stats = terrStats[0] || {};
    }

    let recentUpdates: RecentUpdate[] = [];
    if (role === 'admin') {
      recentUpdates = await query<RecentUpdate>(`
        SELECT TOP 10 
          sd.CustomerCode,
          sd.CustomerName,
          sd.Date,
          sd.[Total _Pm _Slot _Sayısı] as SlotSayisi,
          bl.Territory
        FROM vw_BayiSonVeri sd
        LEFT JOIN ${tblBayi} bl ON sd.CustomerCode = bl.CustomerCode
        ORDER BY sd.Date DESC
      `);
    } else {
      recentUpdates = await query<RecentUpdate>(`
        SELECT TOP 10 
          sd.CustomerCode,
          sd.CustomerName,
          sd.Date,
          sd.[Total _Pm _Slot _Sayısı] as SlotSayisi,
          bl.Territory
        FROM vw_BayiSonVeri sd
        LEFT JOIN ${tblBayi} bl ON sd.CustomerCode = bl.CustomerCode
        WHERE ${sdTerrFilter}
        ORDER BY sd.Date DESC
      `, terrParams);
    }

    const cards: Array<{ label: string; value: number | null; decimals?: number }> = [];
    const settings = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'dashboardCards'`);
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
    const defs: CardDef[] =
      settings.length > 0 ? JSON.parse(settings[0].SettingValue) : [
        { label: 'PM / Endüstri', numeratorKeys: ['Total _Pm _Slot _Sayısı'], denominatorKeys: ['Endüstri _Slot'], multiplier: 100, decimals: 2, active: true },
        { label: 'Top3 / PM', numeratorKeys: ['Total _Top3 _Sku _Slot _Sayısı'], denominatorKeys: ['Total _Pm _Slot _Sayısı'], multiplier: 100, decimals: 2, active: true },
      ];

    const esc = (s: string) => s.replace(/]/g, '');
    const toKeys = (one?: string, many?: string[]) => {
      if (Array.isArray(many) && many.length > 0) return many;
      if (typeof one === 'string' && one.trim()) return one.split(',').map(x => x.trim()).filter(Boolean);
      return [];
    };
    const sumExpr = (keys: string[]) => {
      if (keys.length === 0) return '0';
      return keys.map(k => `COALESCE(CAST(sd.[${esc(k)}] AS FLOAT), 0)`).join(' + ');
    };

    for (const d of defs.filter(x => x?.active !== false)) {
      const numKeys = toKeys(d.numeratorKey, d.numeratorKeys);
      const denKeys = toKeys(d.denominatorKey, d.denominatorKeys);
      const where = role === 'admin' ? '' : `WHERE ${sdTerrFilter}`;
      const sql = `
        SELECT 
          SUM(${sumExpr(numKeys)}) as num,
          SUM(${sumExpr(denKeys)}) as den
        FROM vw_BayiSonVeri sd
        ${where}
      `;
      const sums = await query<{ num: number | null; den: number | null }>(sql, role === 'admin' ? undefined : terrParams);
      const num = sums[0]?.num ?? null;
      const den = sums[0]?.den ?? null;
      const val = den && den !== 0 && num !== null ? ((num / den) * (d.multiplier ?? 1)) : null;
      cards.push({ label: d.label, value: val, decimals: d.decimals });
    }

    const yearsSetting = await query<{ SettingValue: string }>(`SELECT SettingValue FROM Settings WHERE SettingKey = 'performanceYears'`);
    const parsedYears = yearsSetting.length > 0 ? ((): { baselineYear?: unknown; targetYear?: unknown } => {
      try { return JSON.parse(yearsSetting[0].SettingValue); } catch { return {}; }
    })() : {};
    const baselineYear = Number.isFinite(Number(parsedYears.baselineYear)) ? Math.trunc(Number(parsedYears.baselineYear)) : 2025;
    const cardsBefore: Array<{ label: string; value: number | null; decimals?: number }> = [];
    for (const d of defs.filter(x => x?.active !== false)) {
      const numKeys = toKeys(d.numeratorKey, d.numeratorKeys);
      const denKeys = toKeys(d.denominatorKey, d.denominatorKeys);
      const filterJoin = role === 'admin' ? '' : `INNER JOIN ${tblBayi} bl ON bl.CustomerCode = b.CustomerCode AND ${blTerrFilter}`;
      const sql = `
        WITH base AS (
          SELECT sd.CustomerCode, MAX(sd.Date) AS MaxDate
          FROM ${tblSlot} sd
          WHERE YEAR(sd.Date) = @baselineYear
          GROUP BY sd.CustomerCode
        )
        SELECT 
          SUM(${numKeys.length ? numKeys.map(k => `COALESCE(CAST(b.[${esc(k)}] AS FLOAT),0)`).join(' + ') : '0'}) as num,
          SUM(${denKeys.length ? denKeys.map(k => `COALESCE(CAST(b.[${esc(k)}] AS FLOAT),0)`).join(' + ') : '0'}) as den
        FROM ${tblSlot} b
        INNER JOIN base bx ON bx.CustomerCode = b.CustomerCode AND bx.MaxDate = b.Date
        ${filterJoin}
      `;
      const params = role === 'admin' ? { baselineYear } : { baselineYear, ...terrParams };
      const sums = await query<{ num: number | null; den: number | null }>(sql, params);
      const num = sums[0]?.num ?? null;
      const den = sums[0]?.den ?? null;
      const val = den && den !== 0 && num !== null ? ((num / den) * (d.multiplier ?? 1)) : null;
      cardsBefore.push({ label: d.label, value: val, decimals: d.decimals });
    }

    return NextResponse.json({
      stats,
      recentUpdates,
      cards, // after
      cardsBefore,
      baselineYear,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
