import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, getDb } from '@/lib/db';

const tblSlot = "['Slot_Data']";
const tblLog = "SlotChangeLog";

type SessionUserMeta = { id?: string; territoryCode?: string; territoryCodes?: string[]; role?: string };

type SlotPostBody = {
  customerCode: string;
  date: string;
  territory: string;
  region?: string;
  zone?: string;
  depp?: string;
  mosaic?: string;
  mp?: boolean;
  [key: string]: unknown;
};

type SlotPutBody = {
  id: number;
  customerCode: string;
  slotColumn: string;
  newValue: number | string;
  date: string;
};

const SLOT_COPY_KEYS = [
  'J _Firma Slot Sayısı',
  'B _Firma Slot Sayısı',
  'Total _Pm _Slot _Sayısı',
  'Total _Top3 _Sku _Slot _Sayısı',
  'Total_Stratejik_SKU_Slot_Sayısı',
  'CHMODENAVY',
  'CHNAVYBRCB',
  'CHNB100RCB',
  'LAB100RCB',
  'LARKBRCB',
  'LM100RCB',
  'LMRCB',
  'MFTB',
  'MLEDBLUE',
  'MLEDGE',
  'MLEDSKY',
  'MLEDSLIMS',
  'MLFTB',
  'MLR100',
  'MLROLL50',
  'MLRTGRAYRCB',
  'MLTBLUE',
  'MLTGRAY',
  'MLTONE',
  'MUABLU',
  'MUARCB',
  'PL100',
  'PLABS100',
  'PLLONGRCB',
  'PLLRC',
  'PLMNRCB',
  'PLRC',
  'PLRSVRCB',
] as const;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SlotPostBody;
    const {
      customerCode,
      date,
      territory,
      region,
      zone,
      depp,
      mosaic,
      mp,
      ...slotValues
    } = body;

    const user = session.user as SessionUserMeta;
    const userId = Number.parseInt(user.id ?? '', 10);
    const territoryCode = user.territoryCode;
    const territoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);
    const role = user.role;

    const allowedTerritories = territoryCodes.length ? territoryCodes : (territoryCode ? [territoryCode] : []);
    if (role !== 'admin' && !allowedTerritories.includes(territory)) {
      return NextResponse.json({ error: 'Bu bayiye slot ekleme yetkiniz yok' }, { status: 403 });
    }

    const db = await getDb();

    const bayi = await query<{ CustomerName: string; Region: string; Zone: string; EndustriSlot: number }>(`
      SELECT CustomerName, Region, Zone, [Endüstri _Slot] as EndustriSlot
      FROM vw_BayiSonVeri 
      WHERE CustomerCode = @customerCode
    `, { customerCode });

    const customerName = bayi[0]?.CustomerName || '';
    const customerRegion = bayi[0]?.Region || region || '';
    const customerZone = bayi[0]?.Zone || zone || '';
    const endustriSlot = bayi[0]?.EndustriSlot || 0;

    const previousRows = await query<Record<string, unknown> & { Date?: string }>(`
      SELECT TOP 1 *
      FROM ${tblSlot}
      WHERE CustomerCode = @customerCode
      ORDER BY Date DESC
    `, { customerCode });
    const previous = previousRows[0] ?? null;

    const hasKey = (obj: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(obj, k);
    const toNum = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const prevVal = (k: string) => toNum(previous ? previous[k] : null);
    const bodyVal = (k: string) => hasKey(slotValues, k) ? toNum(slotValues[k]) : null;

    const merged: Record<string, number | null> = {};
    for (const k of SLOT_COPY_KEYS) {
      const fromBody = bodyVal(k);
      const fromPrev = prevVal(k);
      const isNullable = k === 'J _Firma Slot Sayısı' || k === 'B _Firma Slot Sayısı';
      if (fromBody !== null) {
        merged[k] = fromBody;
      } else if (fromPrev !== null) {
        merged[k] = fromPrev;
      } else {
        merged[k] = isNullable ? null : 0;
      }
    }

    const insertQuery = `
      INSERT INTO ${tblSlot} (
        aa, Depo, CustomerCode, CustomerName, Mosaic, Date, MP, Region, Territory, 
        TerritoryAdı, Zone, [Endüstri _Slot], [J _Firma Slot Sayısı], [B _Firma Slot Sayısı],
        [Total _Pm _Slot _Sayısı], [Total _Top3 _Sku _Slot _Sayısı], [Total_Stratejik_SKU_Slot_Sayısı],
        CHMODENAVY, CHNAVYBRCB, CHNB100RCB, LAB100RCB, LARKBRCB, LM100RCB, LMRCB, MFTB,
        MLEDBLUE, MLEDGE, MLEDSKY, MLEDSLIMS, MLFTB, MLR100, MLROLL50, MLRTGRAYRCB,
        MLTBLUE, MLTGRAY, MLTONE, MUABLU, MUARCB, PL100, PLABS100, PLLONGRCB, PLLRC,
        PLMNRCB, PLRC, PLRSVRCB
      ) VALUES (
        'A', @depo, @customerCode, @customerName, @mosaic, @date, @mp, @region, @territory,
        @territoryAdi, @zone, @endustriSlot, @jFirma, @bFirma,
        @totalPm, @totalTop3, @totalStratejik,
        @CHMODENAVY, @CHNAVYBRCB, @CHNB100RCB, @LAB100RCB, @LARKBRCB, @LM100RCB, @LMRCB, @MFTB,
        @MLEDBLUE, @MLEDGE, @MLEDSKY, @MLEDSLIMS, @MLFTB, @MLR100, @MLROLL50, @MLRTGRAYRCB,
        @MLTBLUE, @MLTGRAY, @MLTONE, @MUABLU, @MUARCB, @PL100, @PLABS100, @PLLONGRCB, @PLLRC,
        @PLMNRCB, @PLRC, @PLRSVRCB
      )
    `;

    const insertParams = {
      customerCode,
      customerName,
      date,
      territory,
      territoryAdi: territory,
      region: customerRegion,
      zone: customerZone,
      depp: depp || 'Salihli',
      mosaic: mosaic || '',
      mp: mp || false,
      endustriSlot,
      jFirma: merged['J _Firma Slot Sayısı'],
      bFirma: merged['B _Firma Slot Sayısı'],
      totalPm: merged['Total _Pm _Slot _Sayısı'] ?? 0,
      totalTop3: merged['Total _Top3 _Sku _Slot _Sayısı'] ?? 0,
      totalStratejik: merged['Total_Stratejik_SKU_Slot_Sayısı'] ?? 0,
      CHMODENAVY: merged.CHMODENAVY ?? 0,
      CHNAVYBRCB: merged.CHNAVYBRCB ?? 0,
      CHNB100RCB: merged.CHNB100RCB ?? 0,
      LAB100RCB: merged.LAB100RCB ?? 0,
      LARKBRCB: merged.LARKBRCB ?? 0,
      LM100RCB: merged.LM100RCB ?? 0,
      LMRCB: merged.LMRCB ?? 0,
      MFTB: merged.MFTB ?? 0,
      MLEDBLUE: merged.MLEDBLUE ?? 0,
      MLEDGE: merged.MLEDGE ?? 0,
      MLEDSKY: merged.MLEDSKY ?? 0,
      MLEDSLIMS: merged.MLEDSLIMS ?? 0,
      MLFTB: merged.MLFTB ?? 0,
      MLR100: merged.MLR100 ?? 0,
      MLROLL50: merged.MLROLL50 ?? 0,
      MLRTGRAYRCB: merged.MLRTGRAYRCB ?? 0,
      MLTBLUE: merged.MLTBLUE ?? 0,
      MLTGRAY: merged.MLTGRAY ?? 0,
      MLTONE: merged.MLTONE ?? 0,
      MUABLU: merged.MUABLU ?? 0,
      MUARCB: merged.MUARCB ?? 0,
      PL100: merged.PL100 ?? 0,
      PLABS100: merged.PLABS100 ?? 0,
      PLLONGRCB: merged.PLLONGRCB ?? 0,
      PLLRC: merged.PLLRC ?? 0,
      PLMNRCB: merged.PLMNRCB ?? 0,
      PLRC: merged.PLRC ?? 0,
      PLRSVRCB: merged.PLRSVRCB ?? 0,
    };

    const insertRequest = db.request();
    for (const [key, value] of Object.entries(insertParams)) {
      insertRequest.input(key, value);
    }
    await insertRequest.query(insertQuery);

    for (const k of SLOT_COPY_KEYS) {
      const oldValue = prevVal(k) ?? 0;
      const newValue = merged[k] ?? 0;
      if (oldValue !== newValue) {
        await query(`
          INSERT INTO ${tblLog} (CustomerCode, SlotDate, SlotColumn, OldValue, NewValue, ChangedBy, ChangeType)
          VALUES (@customerCode, @date, @column, @oldValue, @newValue, @userId, 'INSERT')
        `, { customerCode, date, column: k, oldValue, newValue, userId });
      }
    }

    return NextResponse.json({ success: true, message: 'Slot verisi eklendi' });
  } catch (error) {
    console.error('Slot ekleme error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SlotPutBody;
    const { customerCode, slotColumn, newValue, date } = body;

    const user = session.user as SessionUserMeta;
    const userId = Number.parseInt(user.id ?? '', 10);

    const oldData = await query<{ oldValue: number }>(`
      SELECT TOP 1 [${slotColumn}] as oldValue
      FROM ${tblSlot}
      WHERE CustomerCode = @customerCode AND Date = @date
    `, { customerCode, date });

    if (oldData.length === 0) {
      return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 });
    }

    const oldValue = oldData[0].oldValue;

    const db = await getDb();
    const updateRequest = db.request();
    updateRequest.input('customerCode', customerCode);
    updateRequest.input('date', date);
    updateRequest.input('newValue', Number.parseFloat(String(newValue)) || 0);
    await updateRequest.query(`
      UPDATE ${tblSlot}
      SET [${slotColumn}] = @newValue
      WHERE CustomerCode = @customerCode AND Date = @date
    `);

    await query(`
      INSERT INTO ${tblLog} (CustomerCode, SlotDate, SlotColumn, OldValue, NewValue, ChangedBy, ChangeType)
      VALUES (@customerCode, @date, @column, @oldValue, @newValue, @userId, 'UPDATE')
    `, { customerCode, date, column: slotColumn, oldValue: oldValue || 0, newValue, userId });

    return NextResponse.json({ success: true, message: 'Slot güncellendi' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Slot güncelleme error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
