# Using googleDataService

## Install

```bash
npm install googleapis @google-analytics/data google-auth-library
```

## Typical route usage (with token persistence)

Every exported function returns `{ data, refreshedTokens? }`. Always persist
`refreshedTokens` when present, or subsequent calls will keep re-triggering
a refresh unnecessarily (or fail once the original access_token is fully
expired and Google has already rotated the refresh_token).

```ts
import { Router } from "express";
import { getSearchConsoleData } from "../services/googleDataService";
import { upsertGoogleTokens } from "../db/database";
import { getStoredTokensFor } from "../db/database"; // implement per your schema

const router = Router();

router.get("/gsc/:agencyId/:clientId", async (req, res) => {
  const { agencyId, clientId } = req.params;
  const { siteUrl, startDate, endDate } = req.query as Record<string, string>;

  const stored = await getStoredTokensFor(agencyId, clientId);
  if (!stored) return res.status(404).json({ error: "No connected Google account" });

  try {
    const { data, refreshedTokens } = await getSearchConsoleData(
      stored,
      siteUrl,
      startDate,
      endDate
    );

    if (refreshedTokens) {
      await upsertGoogleTokens({ agencyId, clientId, ...refreshedTokens });
    }

    res.json(data);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

export default router;
```

## Notes

- **Date format**: `startDate`/`endDate` for both GSC and GA4 use `YYYY-MM-DD`
  (or GA4's relative keywords like `"7daysAgo"`, `"today"`).
- **GSC `siteUrl` values**: domain properties are formatted as
  `sc-domain:example.com`; URL-prefix properties as `https://example.com/`.
  Use whatever `getSearchConsoleProperties` returned — don't reconstruct it.
- **GA4 `propertyId`**: numeric only (e.g. `"356789123"`), found in GA4 Admin
  → Property Settings. Don't include the `properties/` prefix — the service
  adds it.
- **Scopes**: these calls assume the tokens were issued with
  `webmasters.readonly` and `analytics.readonly` (see the auth routes from
  Stage 2). Missing scopes will surface as a 403 from Google, wrapped in
  `GoogleApiError`.
