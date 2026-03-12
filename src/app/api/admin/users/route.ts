import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

type AdminUserRow = {
  ID: number;
  TerritoryCode: string | null;
  TerritoryName: string | null;
  Email: string | null;
  Role: string | null;
  IsActive: number;
  LastLogin: string | null;
};

type UserTerritoriesSetting = Record<string, string[]>;
type UserNamesSetting = Record<string, string>;

function normalizeEmail(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s || null;
}

function normalizeRole(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'admin') return 'admin';
  if (s === 'user') return 'user';
  return 'user';
}

function normalizeBool(v: unknown) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

function normalizeFullName(v: unknown) {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s || null;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function getUserTerritoriesSetting(): Promise<UserTerritoriesSetting> {
  const rows = await query<{ SettingValue: string }>(
    `SELECT SettingValue FROM Settings WHERE SettingKey = 'userTerritories'`
  );
  if (rows.length === 0) return {};
  const parsed = parseJson<unknown>(rows[0]?.SettingValue ?? '');
  if (!parsed || typeof parsed !== 'object') return {};

  const out: UserTerritoriesSetting = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const codes = v
      .map(x => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    if (codes.length) out[k] = codes;
  }
  return out;
}

async function getUserNamesSetting(): Promise<UserNamesSetting> {
  const rows = await query<{ SettingValue: string }>(
    `SELECT SettingValue FROM Settings WHERE SettingKey = 'userNames'`
  );
  if (rows.length === 0) return {};
  const parsed = parseJson<unknown>(rows[0]?.SettingValue ?? '');
  if (!parsed || typeof parsed !== 'object') return {};

  const out: UserNamesSetting = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') continue;
    const name = v.trim();
    if (name) out[k] = name;
  }
  return out;
}

async function setUserNamesSetting(setting: UserNamesSetting) {
  const json = JSON.stringify(setting);
  const existing = await query(`SELECT * FROM Settings WHERE SettingKey = 'userNames'`);
  if (existing.length > 0) {
    await query(`UPDATE Settings SET SettingValue = @value WHERE SettingKey = 'userNames'`, { value: json });
  } else {
    await query(`INSERT INTO Settings (SettingKey, SettingValue) VALUES ('userNames', @value)`, { value: json });
  }
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const search = (url.searchParams.get('search') || '').trim();
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(10, parseInt(url.searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;

    const whereParts: string[] = [];
    const params: Record<string, unknown> = { limit, offset };
    if (search) {
      whereParts.push(`(
        Email LIKE @search OR
        TerritoryCode LIKE @search OR
        TerritoryName LIKE @search OR
        Role LIKE @search
      )`);
      params.search = `%${search}%`;
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const totalRows = await query<{ total: number }>(`
      SELECT COUNT(*) AS total
      FROM Users
      ${whereClause}
    `, params);
    const total = totalRows[0]?.total ?? 0;

    const rows = await query<AdminUserRow>(`
      SELECT
        ID,
        TerritoryCode,
        TerritoryName,
        Email,
        Role,
        IsActive,
        LastLogin
      FROM Users
      ${whereClause}
      ORDER BY IsActive DESC, Role ASC, TerritoryCode ASC, Email ASC, ID DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `, params);

    const territorySetting = await getUserTerritoriesSetting();

    return NextResponse.json({
      users: rows.map(r => ({
        ...r,
        TerritoryCodes: territorySetting[String(r.ID)] ?? (r.TerritoryCode ? [r.TerritoryCode] : []),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }, { headers: { 'Cache-Control': 'no-store, must-revalidate' } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    const role = normalizeRole(body?.role);
    const isActive = body?.isActive === undefined ? true : normalizeBool(body?.isActive);
    const fullName = normalizeFullName(body?.fullName);

    if (!email) {
      return NextResponse.json({ error: 'Email zorunlu' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 });
    }

    const existingByEmail = await query<{ ID: number }>(`SELECT TOP 1 ID FROM Users WHERE Email = @email`, { email });
    if (existingByEmail.length > 0) {
      return NextResponse.json({ error: 'Bu email ile kullanıcı zaten var' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO Users (TerritoryCode, TerritoryName, Email, PasswordHash, Role, IsActive)
       VALUES (@territoryCode, @territoryName, @email, @passwordHash, @role, @isActive)`,
      {
        territoryCode: null,
        territoryName: fullName || null,
        email,
        passwordHash,
        role,
        isActive: isActive ? 1 : 0,
      }
    );

    const created = await query<AdminUserRow>(`
      SELECT TOP 1
        ID,
        TerritoryCode,
        TerritoryName,
        Email,
        Role,
        IsActive,
        LastLogin
      FROM Users
      WHERE Email = @email
      ORDER BY ID DESC
    `, { email });

    const territorySetting = await getUserTerritoriesSetting();
    if (fullName) {
      const createdUserId = created[0]?.ID;
      if (createdUserId) {
        const names = await getUserNamesSetting();
        names[String(createdUserId)] = fullName;
        await setUserNamesSetting(names);
      }
    }

    const createdUser = created[0] ?? null;
    return NextResponse.json({
      user: createdUser
        ? {
            ...createdUser,
            TerritoryCodes: territorySetting[String(createdUser.ID)] ?? [],
          }
        : null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
