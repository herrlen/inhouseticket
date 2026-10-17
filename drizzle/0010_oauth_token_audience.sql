-- Custom SQL migration file, put your code below! --
-- Security review 2026-10-17: /mcp now only accepts OAuth tokens whose audience (resources)
-- names the MCP endpoint. Every token issued so far was for that one resource (the only one the
-- provider knows, src/lib/auth.ts); rows without the value get it once, so existing connectors keep
-- working through their next refresh. The URL is production's – other environments hold no real
-- connections, and a mismatch there only means "connect again".
UPDATE "oauth_refresh_token" SET "resources" = ARRAY['https://inhouseticket.com/mcp'] WHERE "resources" IS NULL OR cardinality("resources") = 0;--> statement-breakpoint
UPDATE "oauth_access_token" SET "resources" = ARRAY['https://inhouseticket.com/mcp'] WHERE "resources" IS NULL OR cardinality("resources") = 0;
