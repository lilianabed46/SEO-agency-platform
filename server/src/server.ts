import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(PORT, () => {
  console.log(`SEO Agency Intelligence API listening on http://localhost:${PORT}`);
});
