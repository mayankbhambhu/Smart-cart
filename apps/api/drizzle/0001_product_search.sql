-- Fuzzy product search (typo-tolerant "find item" in store and catalogue search).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_trgm_idx" ON "products" USING gin ((lower("name" || ' ' || "brand")) gin_trgm_ops);
