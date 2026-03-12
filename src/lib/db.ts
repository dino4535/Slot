import mssql from 'mssql';

type DbConfig = {
  server: string;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
  };
};

function getConfig(): DbConfig {
  const { DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_SERVER || !DB_NAME || !DB_USER || !DB_PASSWORD) {
    throw new Error('Veritabanı ortam değişkenleri eksik: DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD');
  }
  return {
    server: DB_SERVER,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
  };
}

let pool: mssql.ConnectionPool | null = null;

export async function getDb() {
  if (!pool) {
    pool = await mssql.connect(getConfig());
  }
  return pool;
}

export async function query<T>(sql: string, params?: Record<string, unknown>) {
  const db = await getDb();
  const request = db.request();
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  
  const result = await request.query(sql);
  return result.recordset as T[];
}

export async function execute<T>(procedure: string, params?: Record<string, unknown>) {
  const db = await getDb();
  const request = db.request();
  
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
  }
  
  const result = await request.execute(procedure);
  return result.recordset as T[];
}

export default getDb;
