import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import clientsRouter from "./routes/clients";
import websitesRouter from "./routes/websites";
import googleRouter from "./routes/google";
import overviewRouter from "./routes/overview";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/clients", clientsRouter);
app.use("/api/websites", websitesRouter);
app.use("/api/google", googleRouter);
app.use("/api/overview", overviewRouter);

// An unknown /api path should answer in JSON like every other endpoint, not Express's HTML 404.
app.use("/api", (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

/**
 * Express 5 forwards rejected async handlers here. Without it an unhandled error
 * renders a stack trace as HTML — which the client's fetch wrapper cannot parse, and
 * which would put our file paths on screen in front of a client.
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || "Internal server error" });
});

export default app;
