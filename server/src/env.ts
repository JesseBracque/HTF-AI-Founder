import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Laadt de root-`.env` (repo-root, niet server/.env). In Docker komen de
 * variabelen via Compose binnen en bestaat er geen .env-bestand; dotenv doet
 * dan niets en de bestaande env vars blijven gelden.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

config({
  path: process.env.ENV_FILE ?? path.resolve(here, "../../.env"),
  quiet: true,
});
