import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

const tblBayi = "['Bayi_Listesi']";

type UserTerritoriesSetting = Record<string, string[]>;

type AdminUserRow = {
  ID: number;
  TerritoryCode: string | null;
  TerritoryName: string | null;
  Email: string | null;
  Role: string | null;
  IsActive: number;
  LastLogin: string | null;
};

function normalizeEmail(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s || null;
}

function normalizeRole(v: unknown) {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (s === 'admin') return 'admin';
  if (s === 'user') return 'user';
  return null;
}

function normalizeBool(v: unknown) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return null;
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
    out[k] = codes;
  }
  return out;
}

async function setUserTerritoriesSetting(setting: UserTerritoriesSetting) {
  const json = JSON.stringify(setting);
  const existing = await query(`SELECT * FROM Settings WHERE SettingKey = 'userTerritories'`);
  if (existing.length > 0) {
    await query(`UPDATE Settings SET SettingValue = @value WHERE SettingKey = 'userTerritories'`, { value: json });
  } else {
    await query(`INSERT INTO Settings (SettingKey, SettingValue) VALUES ('userTerritories', @value)`, { value: json });
  }
}

function normalizeTerritoryCodes(v: unknown): string[] | null {
  if (v === undefined) return null;
  if (!Array.isArray(v)) return [];
  const codes = v
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(codes));
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Geçersiz kullanıcı id' }, { status: 400 });
    }

    const body = await request.json();

    const email = normalizeEmail(body?.email);
    const role = normalizeRole(body?.role);
    const isActive = normalizeBool(body?.isActive);
    const password = typeof body?.password === 'string' ? body.password : '';
    const territoryCodes = normalizeTerritoryCodes(body?.territoryCodes);

    if (email) {
      const existingByEmail = await query<{ ID: number }>(
        `SELECT TOP 1 ID FROM Users WHERE Email = @email AND ID <> @id`,
        { email, id: userId }
      );
      if (existingByEmail.length > 0) {
        return NextResponse.json({ error: 'Bu email başka bir kullanıcıda kayıtlı' }, { status: 409 });
      }
    }

    const setParts: string[] = [];
    const params: Record<string, unknown> = { id: userId };

    if (email !== null) {
      setParts.push('Email = @email');
      params.email = email;
    }
    if (role !== null) {
      setParts.push('Role = @role');
      params.role = role;
      if (role === 'admin') {
        setParts.push('TerritoryCode = NULL');
        setParts.push('TerritoryName = NULL');
      }
    }
    if (isActive !== null) {
      setParts.push('IsActive = @isActive');
      params.isActive = isActive ? 1 : 0;
    }
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      setParts.push('PasswordHash = @passwordHash');
      params.passwordHash = passwordHash;
    }

    if (setParts.length === 0 && territoryCodes === null) {
      return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 });
    }

    if (setParts.length > 0) {
      await query(`UPDATE Users SET ${setParts.join(', ')} WHERE ID = @id`, params);
    }

    if (territoryCodes !== null) {
      const currentRole = (role !== null ? role : (await query<{ Role: string | null }>(`SELECT Role FROM Users WHERE ID = @id`, { id: userId }))[0]?.Role) ?? null;
      const nextCodes = currentRole === 'admin' ? [] : territoryCodes;

      const setting = await getUserTerritoriesSetting();
      setting[String(userId)] = nextCodes;
      await setUserTerritoriesSetting(setting);

      const primaryCode = nextCodes[0] ?? null;
      if (primaryCode) {
        const conflict = await query<{ ID: number }>(
          `SELECT TOP 1 ID FROM Users WHERE TerritoryCode = @code AND ID <> @id`,
          { code: primaryCode, id: userId }
        );
        if (conflict.length > 0) {
          await query(`UPDATE Users SET TerritoryCode = NULL WHERE ID = @id`, { id: userId });
        } else {
          const nameRow = await query<{ Territory: string }>(
            `SELECT TOP 1 Territory FROM ${tblBayi} WHERE TerritoryCode = @code`,
            { code: primaryCode }
          );
          const primaryName = nameRow[0]?.Territory ?? null;
          await query(
            `UPDATE Users SET TerritoryCode = @code, TerritoryName = @name WHERE ID = @id`,
            { id: userId, code: primaryCode, name: primaryName }
          );
        }
      } else {
        await query(`UPDATE Users SET TerritoryCode = NULL WHERE ID = @id`, { id: userId });
      }
    }

    const updated = await query<AdminUserRow>(`
      SELECT
        ID,
        TerritoryCode,
        TerritoryName,
        Email,
        Role,
        IsActive,
        LastLogin
      FROM Users
      WHERE ID = @id
    `, { id: userId });

    const setting = await getUserTerritoriesSetting();
    const u = updated[0] ?? null;
    return NextResponse.json({
      user: u
        ? {
            ...u,
            TerritoryCodes: setting[String(u.ID)] ?? (u.TerritoryCode ? [u.TerritoryCode] : []),
          }
        : null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string } | undefined;
    if (!session || user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: 'Geçersiz kullanıcı id' }, { status: 400 });
    }

    await query(`UPDATE Users SET IsActive = 0 WHERE ID = @id`, { id: userId });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
