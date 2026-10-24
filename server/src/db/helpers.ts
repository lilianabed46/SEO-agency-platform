import type { Database, SqlValue } from "sql.js";

type Params = Record<string, SqlValue> | SqlValue[];

export function queryAll<T = Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: Params = []
): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryOne<T = Record<string, SqlValue>>(
  db: Database,
  sql: string,
  params: Params = []
): T | null {
  const rows = queryAll<T>(db, sql, params);
  return rows[0] ?? null;
}

export function run(db: Database, sql: string, params: Params = []): void {
  db.run(sql, params);
}
