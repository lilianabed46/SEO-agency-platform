import { Router } from "express";
import { v4 as uuid } from "uuid";
import { getDb, saveDb } from "../db";
import { queryAll, queryOne, run } from "../db/helpers";
import type { Client, Website } from "../types";

const router = Router();

// GET /api/clients — list all clients with their website count
router.get("/", async (_req, res) => {
  const db = await getDb();
  const clients = queryAll<Client & { website_count: number }>(
    db,
    `SELECT c.*, COUNT(w.id) AS website_count
     FROM clients c
     LEFT JOIN websites w ON w.client_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );
  res.json(clients);
});

// GET /api/clients/:id — client profile + attached websites
router.get("/:id", async (req, res) => {
  const db = await getDb();
  const client = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [req.params.id]);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  const websites = queryAll<Website>(db, "SELECT * FROM websites WHERE client_id = ? ORDER BY created_at DESC", [
    req.params.id,
  ]);
  res.json({ ...client, websites });
});

// POST /api/clients — create a client
router.post("/", async (req, res) => {
  const { name, contact_email, contact_phone, notes } = req.body ?? {};
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const db = await getDb();
  const id = uuid();
  run(db, "INSERT INTO clients (id, name, contact_email, contact_phone, notes) VALUES (?, ?, ?, ?, ?)", [
    id,
    name,
    contact_email ?? null,
    contact_phone ?? null,
    notes ?? null,
  ]);
  saveDb();

  const client = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [id]);
  res.status(201).json(client);
});

// PUT /api/clients/:id — update a client
router.put("/:id", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const { name, contact_email, contact_phone, notes } = req.body ?? {};
  run(db, "UPDATE clients SET name = ?, contact_email = ?, contact_phone = ?, notes = ? WHERE id = ?", [
    name ?? existing.name,
    contact_email ?? existing.contact_email,
    contact_phone ?? existing.contact_phone,
    notes ?? existing.notes,
    req.params.id,
  ]);
  saveDb();

  const updated = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [req.params.id]);
  res.json(updated);
});

// POST /api/clients/:id/websites — attach a website to a client
router.post("/:id/websites", async (req, res) => {
  const db = await getDb();
  const client = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [req.params.id]);
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const { url, site_type, country, language, goal, niche, target_audience, cms } = req.body ?? {};
  const validSiteTypes = ["store", "services", "blog"];
  if (!url || !validSiteTypes.includes(site_type) || !country || !language) {
    res.status(400).json({ error: "url, site_type (store/services/blog), country and language are required" });
    return;
  }

  const id = uuid();
  run(
    db,
    `INSERT INTO websites (id, client_id, url, site_type, country, language, goal, niche, target_audience, cms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, url, site_type, country, language, goal ?? null, niche ?? null, target_audience ?? null, cms ?? null]
  );
  saveDb();

  const website = queryOne<Website>(db, "SELECT * FROM websites WHERE id = ?", [id]);
  res.status(201).json(website);
});

// DELETE /api/clients/:id — delete a client (cascades to its websites)
router.delete("/:id", async (req, res) => {
  const db = await getDb();
  const existing = queryOne<Client>(db, "SELECT * FROM clients WHERE id = ?", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  run(db, "DELETE FROM clients WHERE id = ?", [req.params.id]);
  saveDb();
  res.status(204).send();
});

export default router;
