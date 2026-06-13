import { createHmac, timingSafeEqual } from "node:crypto";

// Paddle Billing 웹훅 서명 검증(순수 함수 — 테스트 가능).
// 헤더 형식: "ts=<unix>;h1=<hex hmac>". HMAC-SHA256( `${ts}:${rawBody}`, secret ).
export function verifyPaddleSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const kv of signatureHeader.split(";")) {
    const idx = kv.indexOf("=");
    if (idx > 0) parts[kv.slice(0, idx).trim()] = kv.slice(idx + 1).trim();
  }
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(h1, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
