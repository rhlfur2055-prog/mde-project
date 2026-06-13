import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyPaddleSignature } from "./verify";

const SECRET = "pdl_ntfset_test_secret";
const BODY = JSON.stringify({ event_type: "transaction.completed", data: { id: "txn_1" } });

function sign(body: string, ts: string, secret: string): string {
  const h1 = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

describe("verifyPaddleSignature", () => {
  it("유효한 서명을 통과시킨다", () => {
    const header = sign(BODY, "1700000000", SECRET);
    expect(verifyPaddleSignature(BODY, header, SECRET)).toBe(true);
  });

  it("본문이 변조되면 거부한다", () => {
    const header = sign(BODY, "1700000000", SECRET);
    expect(verifyPaddleSignature(BODY + "x", header, SECRET)).toBe(false);
  });

  it("시크릿이 다르면 거부한다", () => {
    const header = sign(BODY, "1700000000", SECRET);
    expect(verifyPaddleSignature(BODY, header, "wrong")).toBe(false);
  });

  it("헤더·시크릿 누락이면 거부한다", () => {
    expect(verifyPaddleSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyPaddleSignature(BODY, "ts=1;h1=ab", undefined)).toBe(false);
    expect(verifyPaddleSignature(BODY, "garbage", SECRET)).toBe(false);
  });
});
