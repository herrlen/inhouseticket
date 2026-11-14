// Credentials of integrations at rest: AES-256-GCM with a key derived (HKDF-SHA256) from
// INTEGRATION_SECRET. Format "v1:<iv>:<ciphertext+tag>" (base64url), so a later key or algorithm
// can be told apart. The AAD binds a ciphertext to its row ("integration.credentials:<id>"): a
// value copied into another row does not decrypt. Plaintext is never logged or sent to a client.
// Framework-free (node:crypto only); the secret is passed in, the caller reads it from env.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SALT = "inhouseticket/integrations";
const INFO = "integration-credentials:v1";

export class CredentialsError extends Error {
  constructor(readonly code: "no_secret" | "malformed" | "unreadable") {
    super(`credentials_${code}`);
  }
}

export const credentialsAad = (integrationId: string) => `integration.credentials:${integrationId}`;
/** Webhook id and secret (`integration.webhook`): own AAD, so the two sealed columns never swap. */
export const webhookAad = (integrationId: string) => `integration.webhook:${integrationId}`;

function key(secret: string): Buffer {
  if (!secret || secret.length < 32) throw new CredentialsError("no_secret");
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.from(SALT, "utf8"), Buffer.from(INFO, "utf8"), 32));
}

export function sealCredentials(plaintext: string, aad: string, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}:${iv.toString("base64url")}:${body.toString("base64url")}`;
}

export function openCredentials(sealed: string, aad: string, secret: string): string {
  const parts = sealed.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new CredentialsError("malformed");
  const iv = Buffer.from(parts[1]!, "base64url");
  const body = Buffer.from(parts[2]!, "base64url");
  if (iv.length !== IV_BYTES || body.length < TAG_BYTES) throw new CredentialsError("malformed");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    // Wrong key, wrong row or tampered – same answer, no details.
    throw new CredentialsError("unreadable");
  }
}

/** What the UI may show of a token: "pk_…1234". */
export function tokenHint(token: string): string {
  const t = token.trim();
  const prefix = /^[a-z]{1,4}_/i.exec(t)?.[0] ?? "";
  return `${prefix}…${t.slice(-4)}`;
}
