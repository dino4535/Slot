import { NextResponse, NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';

const tblBayi = "['Bayi_Listesi']";
const tblSlot = "['Slot_Data']";
const tblLog = "SlotChangeLog";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const user = session.user as { territoryCode?: string; territoryCodes?: string[]; role?: string };
    const territoryCode = user.territoryCode;
    const territoryCodes = (Array.isArray(user.territoryCodes) ? user.territoryCodes : []).filter(Boolean);
    const role = user.role;

    const accessWhereParts = ['CustomerCode = @customerCode'];
    const accessParams: Record<string, unknown> = { customerCode: id };
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

    const currentData = await query(`
      SELECT TOP 1 *
      FROM ${tblSlot}
      WHERE CustomerCode = @customerCode
      ORDER BY Date DESC
    `, { customerCode: id });

    const history = await query(`
      SELECT * FROM ${tblSlot}
      WHERE CustomerCode = @customerCode 
      ORDER BY Date DESC
    `, { customerCode: id });

    const changes = await query(`
      SELECT TOP 20 
        cl.*,
        u.TerritoryName as ChangedByName
      FROM ${tblLog} cl
      LEFT JOIN Users u ON cl.ChangedBy = u.ID
      WHERE cl.CustomerCode = @customerCode
      ORDER BY cl.ChangedAt DESC
    `, { customerCode: id });

    return NextResponse.json({
      bayi: accessCheck[0],
      currentData: currentData[0] || null,
      history,
      changes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Bayi detay error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
