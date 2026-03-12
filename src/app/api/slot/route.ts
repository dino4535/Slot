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
      jFirma: slotValues['J _Firma Slot Sayısı'] || null,
      bFirma: slotValues['B _Firma Slot Sayısı'] || null,
      totalPm: slotValues['Total _Pm _Slot _Sayısı'] || 0,
      totalTop3: slotValues['Total _Top3 _Sku _Slot _Sayısı'] || 0,
      totalStratejik: slotValues['Total_Stratejik_SKU_Slot_Sayısı'] || 0,
      ...Object.fromEntries(
        Object.entries(slotValues).map(([k, v]) => [k, Number.parseFloat(String(v)) || 0])
      ),
    };

    const insertRequest = db.request();
    for (const [key, value] of Object.entries(insertParams)) {
      insertRequest.input(key, value);
    }
    await insertRequest.query(insertQuery);

    for (const [key, value] of Object.entries(slotValues)) {
      if (value !== undefined && value !== null) {
        await query(`
          INSERT INTO ${tblLog} (CustomerCode, SlotDate, SlotColumn, OldValue, NewValue, ChangedBy, ChangeType)
          VALUES (@customerCode, @date, @column, 0, @newValue, @userId, 'INSERT')
        `, { customerCode, date, column: key, newValue: value, userId });
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
    const { id, customerCode, slotColumn, newValue, date } = body;

    const user = session.user as SessionUserMeta;
    const userId = Number.parseInt(user.id ?? '', 10);

    const oldData = await query<{ oldValue: number }>(`
      SELECT [${slotColumn}] as oldValue FROM ${tblSlot} WHERE ID = @id
    `, { id });

    if (oldData.length === 0) {
      return NextResponse.json({ error: 'Kayıt bulunamadı' }, { status: 404 });
    }

    const oldValue = oldData[0].oldValue;

    const db = await getDb();
    const updateRequest = db.request();
    updateRequest.input('id', id);
    updateRequest.input('newValue', Number.parseFloat(String(newValue)) || 0);
    await updateRequest.query(`
      UPDATE ${tblSlot} SET [${slotColumn}] = @newValue WHERE ID = @id
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
