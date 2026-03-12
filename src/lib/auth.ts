import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';

type DbUserRow = {
  ID: number;
  TerritoryName?: string | null;
  TerritoryCode?: string | null;
  Email?: string | null;
  PasswordHash: string;
  Role?: string | null;
};

type UserTerritoriesSetting = Record<string, string[]>;
type UserNamesSetting = Record<string, string>;

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

function getTerritoryCodesForUser(setting: UserTerritoriesSetting, user: DbUserRow): string[] {
  const mapped = setting[String(user.ID)];
  if (mapped && mapped.length) return mapped;
  if (user.TerritoryCode) return [user.TerritoryCode];
  return [];
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      id: 'credentials',
      type: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        territoryCode: { label: 'Territory Code', type: 'text' },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email && !credentials?.territoryCode) {
            return null;
          }

          const email = credentials.email;
          const territoryCode = credentials.territoryCode;
          const password = credentials.password;

          const hasDbEnv = Boolean(
            process.env.DB_SERVER &&
            process.env.DB_NAME &&
            process.env.DB_USER &&
            process.env.DB_PASSWORD
          );

          if (!hasDbEnv && process.env.DEV_LOCAL_LOGIN === '1') {
            const role = process.env.DEV_ROLE || 'admin';
            const required = process.env.DEV_TEST_PASSWORD;
            if (required && password !== required) {
              return null;
            }
            const devUser: { id: string; name?: string; email?: string; territoryCode?: string; role?: string } = {
              id: 'dev-user',
              name: territoryCode || email || 'Dev User',
              email: email || undefined,
              territoryCode: territoryCode || undefined,
              role,
            };
            return devUser;
          }

          let users: DbUserRow[] = [];

          if (email) {
            users = await query<DbUserRow>(
              'SELECT * FROM Users WHERE Email = @email AND IsActive = 1',
              { email }
            );
          } else if (territoryCode) {
            users = await query<DbUserRow>(
              'SELECT * FROM Users WHERE TerritoryCode = @territoryCode AND IsActive = 1',
              { territoryCode }
            );
          }

          if (users.length === 0) {
            if (territoryCode) {
              const mapping = await getUserTerritoriesSetting();
              const matchedUserId = Object.entries(mapping).find(([, codes]) => codes.includes(territoryCode))?.[0];
              if (matchedUserId) {
                users = await query<DbUserRow>(
                  'SELECT * FROM Users WHERE ID = @id AND IsActive = 1',
                  { id: Number(matchedUserId) }
                );
              }
            }
          }

          if (users.length === 0) {
            return null;
          }

          const user = users[0];

          if (password) {
            const isValid = await bcrypt.compare(password, user.PasswordHash);
            if (!isValid) {
              return null;
            }
          }

          await query(
            'UPDATE Users SET LastLogin = GETDATE() WHERE ID = @id',
            { id: user.ID }
          );

          const mapping = await getUserTerritoriesSetting();
          const territoryCodes = getTerritoryCodesForUser(mapping, user);
          const userNames = await getUserNamesSetting();
          const role = user.Role || undefined;
          const displayName = userNames[String(user.ID)] || undefined;

          return {
            id: user.ID.toString(),
            name: displayName || user.TerritoryName || user.TerritoryCode || user.Email || undefined,
            email: user.Email || undefined,
            territoryCode: user.TerritoryCode || undefined,
            territoryCodes,
            role,
          };
        } catch (error: unknown) {
          console.error('Authorize error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.territoryCode = (user as { territoryCode?: string }).territoryCode;
        token.territoryCodes = (user as { territoryCodes?: string[] }).territoryCodes;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { territoryCode?: string }).territoryCode = token.territoryCode as string | undefined;
        (session.user as { territoryCodes?: string[] }).territoryCodes = (token.territoryCodes as string[] | undefined) ?? [];
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
