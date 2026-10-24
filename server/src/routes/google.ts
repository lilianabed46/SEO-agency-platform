import { Router } from "express";
import { google } from "googleapis";
import { getDb } from "../db";
import { config } from "../config";
import {
  buildAuthUrl,
  handleOAuthCallback,
  getStatus,
  disconnect,
  getAuthorizedClient,
  GoogleNotConnectedError,
} from "../lib/googleAuth";
import type { GoogleProperties, Ga4PropertyEntry, GscSiteEntry } from "../types";

const router = Router();

// GET /api/google/connect
router.get("/connect", (_req, res) => {
  res.redirect(buildAuthUrl());
});

// GET /api/google/oauth/callback
router.get("/oauth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) {
    res.redirect(`${config.clientOrigin}/?google=error`);
    return;
  }

  try {
    const db = await getDb();
    await handleOAuthCallback(db, code);
    res.redirect(`${config.clientOrigin}/?google=connected`);
  } catch (err) {
    console.error("Google OAuth callback failed:", err);
    res.redirect(`${config.clientOrigin}/?google=error`);
  }
});

// GET /api/google/status
router.get("/status", async (_req, res) => {
  const db = await getDb();
  res.json(getStatus(db));
});

// DELETE /api/google
router.delete("/", async (_req, res) => {
  const db = await getDb();
  disconnect(db);
  res.status(204).send();
});

// GET /api/google/properties
router.get("/properties", async (_req, res) => {
  try {
    const db = await getDb();
    const auth = getAuthorizedClient(db);

    const webmasters = google.webmasters({ version: "v3", auth });
    const analyticsAdmin = google.analyticsadmin({ version: "v1beta", auth });

    const [sitesResponse, accountSummariesResponse] = await Promise.all([
      webmasters.sites.list(),
      analyticsAdmin.accountSummaries.list(),
    ]);

    const gscSites: GscSiteEntry[] = (sitesResponse.data.siteEntry ?? []).map((entry) => ({
      siteUrl: entry.siteUrl ?? "",
      permissionLevel: entry.permissionLevel ?? null,
    }));

    const ga4Properties: Ga4PropertyEntry[] = (accountSummariesResponse.data.accountSummaries ?? []).flatMap(
      (account) =>
        (account.propertySummaries ?? []).map((property) => ({
          propertyId: (property.property ?? "").replace("properties/", ""),
          displayName: property.displayName ?? null,
          accountName: account.displayName ?? null,
        }))
    );

    const result: GoogleProperties = { gscSites, ga4Properties };
    res.json(result);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Failed to load Google properties:", err);
    res.status(502).json({ error: "Failed to load properties from Google" });
  }
});

export default router;
