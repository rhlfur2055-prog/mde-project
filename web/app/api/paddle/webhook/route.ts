import type { NextRequest } from "next/server";
import { verifyPaddleSignature } from "@/lib/paddle/verify";
import { createAdminClient } from "@/lib/supabase/admin";

// 결제 → Pro 전환 웹훅. Paddle 서명 검증 후 profiles.plan 갱신.
// crypto 사용 → Node 런타임 고정. 시크릿: PADDLE_WEBHOOK_SECRET, SUPABASE_SECRET_KEY (.env.local).
export const runtime = "nodejs";

const PRO_EVENTS = ["subscription.activated", "subscription.created", "transaction.completed"];
const FREE_EVENTS = ["subscription.canceled", "subscription.paused"];

export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const raw = await req.text(); // 서명 검증은 원문(raw)으로 — 파싱 전.
  const sig = req.headers.get("paddle-signature");

  if (!verifyPaddleSignature(raw, sig, secret)) {
    return new Response("invalid signature", { status: 401 });
  }

  let event: { event_type?: string; data?: { custom_data?: { user_id?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const type = event.event_type ?? "";
  // 체크아웃 시 custom_data.user_id 로 Supabase 유저 식별(프론트에서 세션 uid를 넘겨야 함).
  const userId = event.data?.custom_data?.user_id;
  const plan = PRO_EVENTS.includes(type) ? "pro" : FREE_EVENTS.includes(type) ? "free" : null;

  if (plan && userId) {
    const admin = createAdminClient();
    if (!admin) return new Response("server not configured", { status: 500 });
    const { error } = await admin
      .from("profiles")
      .upsert({ id: userId, plan, updated_at: new Date().toISOString() });
    if (error) return new Response("db error", { status: 500 });
  }

  // 서명만 맞으면 200(미처리 이벤트도 ack — Paddle 재시도 방지).
  return new Response("ok", { status: 200 });
}
