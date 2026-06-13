// posera — Supabase 스키마 적용(일회성 마이그레이션).
// DB 연결 문자열(비밀번호 포함)은 web/.env.local 의 SUPABASE_DB_URL 에서만 읽는다(gitignore).
// 실행: cd web && node scripts/apply-schema.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 수동 파싱(BOM 안전, 의존성 없이). NEXT_PUBLIC 아닌 서버 전용 키.
function loadEnvLocal() {
  const p = resolve(__dirname, "..", ".env.local");
  const txt = readFileSync(p, "utf8").replace(/^﻿/, "");
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnvLocal();
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "✗ web/.env.local 에 SUPABASE_DB_URL 이 없습니다.\n" +
      "  Supabase 대시보드 → Connect → Connection string 에서 복사해\n" +
      "  SUPABASE_DB_URL=postgresql://... 로 추가하세요(비밀번호 포함, gitignore됨).",
  );
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", "..", "supabase", "schema.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false }, // Supabase는 TLS 필요
});

try {
  await client.connect();
  console.log("· 접속 성공 →", url.replace(/:[^:@/]+@/, ":****@"));
  await client.query(sql);
  console.log("✓ schema.sql 적용 완료");

  const { rows } = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='scans' order by ordinal_position",
  );
  console.log(`✓ public.scans 컬럼 ${rows.length}개:`, rows.map((r) => r.column_name).join(", "));

  const pol = await client.query(
    "select policyname from pg_policies where schemaname='public' and tablename='scans'",
  );
  console.log("✓ RLS 정책:", pol.rows.map((r) => r.policyname).join(", ") || "(없음)");
} catch (e) {
  console.error("✗ 실패:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
