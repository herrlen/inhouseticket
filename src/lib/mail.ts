import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

// SMTP: Mailpit locally, mittwald mailbox in production (see .env.example).
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  // STARTTLS is mandatory unless the server is local (Mailpit) – magic links never travel in clear text.
  requireTLS: env.SMTP_PORT !== 465 && !["localhost", "127.0.0.1", "::1"].includes(env.SMTP_HOST),
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail): Promise<void> {
  await transport.sendMail({ from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO, ...mail });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, client-safe HTML mail with one button. */
export function buttonMail(opts: { heading: string; intro: string; button: string; url: string; outro: string }): string {
  const url = escapeHtml(opts.url);
  return `<!doctype html><html lang="de"><body style="margin:0;padding:32px;background:#fafaf9;font-family:Inter,Arial,sans-serif;color:#1c1917">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:10px;padding:32px">
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(opts.heading)}</h1>
<p style="font-size:14px;line-height:1.5;margin:0 0 24px">${escapeHtml(opts.intro)}</p>
<a href="${url}" style="display:inline-block;background:#5b5bf7;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:6px">${escapeHtml(opts.button)}</a>
<p style="font-size:12px;line-height:1.5;color:#78716c;margin:24px 0 0">${escapeHtml(opts.outro)}<br><br>Falls der Button nicht funktioniert:<br><span style="word-break:break-all">${url}</span></p>
</div></body></html>`;
}
