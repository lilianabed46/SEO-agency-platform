import { google } from "googleapis";
import { v4 as uuid } from "uuid";
import type { Database } from "sql.js";
import { config } from "../config";
import { saveDb } from "../db";
import { queryOne, run } from "../db/helpers";
import { encrypt, decrypt } from "./crypto";
import type { GoogleConnectionRow, GoogleStatus } from "../types";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export class GoogleNotConnectedError extends Error {
  constructor() {
    super("Google account is not connected yet");
    this.name = "GoogleNotConnectedError";
  }
}

function newOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
}

export function buildAuthUrl(): string {
  const client = newOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function handleOAuthCallback(db: Database, code: string): Promise<void> {
  const client = newOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error(
      "Google did not return a refresh token. Disconnect any prior grant for this app in your Google " +
        "Account permissions, then try connecting again (prompt=consent should prevent this, so this is unexpected)."
    );
  }

  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: userinfo } = await oauth2.userinfo.get();

  saveConnectionRow(db, {
    email: userinfo.email ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scope: tokens.scope ?? SCOPES.join(" "),
  });
}

function saveConnectionRow(
  db: Database,
  params: { email: string | null; accessToken: string; refreshToken: string; expiryDate: number; scope: string }
): void {
  run(db, "DELETE FROM google_connections", []);
  run(
    db,
    `INSERT INTO google_connections
      (id, google_account_email, access_token_encrypted, refresh_token_encrypted, token_expiry, scope)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      params.email,
      encrypt(params.accessToken),
      encrypt(params.refreshToken),
      new Date(params.expiryDate).toISOString(),
      params.scope,
    ]
  );
  saveDb();
}

export function getConnectionRow(db: Database): GoogleConnectionRow | null {
  return queryOne<GoogleConnectionRow>(db, "SELECT * FROM google_connections LIMIT 1", []);
}

export function getStatus(db: Database): GoogleStatus {
  const row = getConnectionRow(db);
  if (!row) {
    return { connected: false, google_account_email: null, connected_at: null };
  }
  return { connected: true, google_account_email: row.google_account_email, connected_at: row.connected_at };
}

export function disconnect(db: Database): void {
  run(db, "DELETE FROM google_connections", []);
  saveDb();
}

export function getAuthorizedClient(db: Database): OAuth2Client {
  const row = getConnectionRow(db);
  if (!row) {
    throw new GoogleNotConnectedError();
  }

  const client = newOAuth2Client();
  client.setCredentials({
    access_token: decrypt(row.access_token_encrypted),
    refresh_token: decrypt(row.refresh_token_encrypted),
    expiry_date: new Date(row.token_expiry).getTime(),
    scope: row.scope,
  });

  client.on("tokens", (tokens: { access_token?: string | null; expiry_date?: number | null }) => {
    if (!tokens.access_token) return;
    run(
      db,
      `UPDATE google_connections
         SET access_token_encrypted = ?,
             token_expiry = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
      [
        encrypt(tokens.access_token),
        new Date(tokens.expiry_date ?? Date.now()).toISOString(),
        row.id,
      ]
    );
    saveDb();
  });

  return client;
}
