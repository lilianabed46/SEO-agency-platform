# Mounting the auth router

In your main app file (e.g. `server/src/app.ts` or `server/src/index.ts`):

```ts
import express from "express";
import authRouter from "./routes/auth";

const app = express();
app.use(express.json());

// All routes below become /api/auth/google/url and /api/auth/google/callback
app.use("/api/auth", authRouter);

app.listen(process.env.PORT || 4000, () => {
  console.log("Server listening");
});
```

## Required `.env` values

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

The redirect URI must be registered exactly (scheme, host, port, path) in the
Google Cloud Console under **APIs & Services > Credentials** for your OAuth
2.0 Client ID.

## Required npm packages

```bash
npm install googleapis sql.js
npm install -D @types/node
```

`sql.js` ships its wasm binary in `node_modules/sql.js/dist/sql-wasm.wasm`;
`database.ts` locates it automatically via `require.resolve`, so no extra
copy step is needed in dev. If you bundle the server (esbuild/webpack) for
production, make sure `sql-wasm.wasm` is copied alongside the build output.

## Flow summary

1. Frontend calls `GET /api/auth/google/url?agencyId=...&clientId=...`
   and redirects the user to the returned `url`.
2. User grants consent on Google's screen.
3. Google redirects to `GET /api/auth/google/callback?code=...&state=...`.
4. The handler exchanges `code` for tokens and upserts them into
   `google_oauth_tokens` in `server/data/app.sqlite`, keyed by
   `(agency_id, client_id)`.
5. Subsequent GSC/GA4 API calls should load the stored `refresh_token`
   for the relevant agency/client, set it on a fresh `OAuth2Client`, and
   let `googleapis` auto-refresh the `access_token` as needed.
