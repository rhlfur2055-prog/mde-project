// Replicate로 운동 시범 영상 생성 (Node/JS, 웹 스택). 파이썬 X.
// web/.env.local 의 REPLICATE_API_TOKEN 사용.
//
// 실행 (web 폴더에서):
//   node scripts/gen-video.mjs --out public/exercises/squat/squat-man.mp4
//   node scripts/gen-video.mjs --model minimax/video-01 --prompt "..." --out ...
//
// ⚠️ 1회 = 영상 1개 생성(Replicate 과금). 테스트는 1개만.
import { config } from "dotenv";
import Replicate from "replicate";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// 토큰은 web/.env.local 또는 루트 .env 어디 둬도 읽음(헷갈림 방지)
config({ path: ".env.local" });
config({ path: "../.env" });

const DEFAULT_PROMPT =
  "A fit young Korean adult performing bodyweight squats in a smooth, seamless " +
  "looping motion, athletic wear, full body, side view, focused only on the " +
  "movement, silent, no talking, plain solid green background, soft lighting, " +
  "leg muscles subtly highlighted in blue";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const model = arg("model", "minimax/video-01");
const prompt = arg("prompt", DEFAULT_PROMPT);
const out = arg("out");

if (!out) {
  console.error("--out <경로> 필요");
  process.exit(1);
}
const token =
  process.env.REPLICATE_API_TOKEN || process.env.replicate_api_token;
if (!token) {
  console.error("REPLICATE 토큰 없음 — .env 에 REPLICATE_API_TOKEN=r8_... 추가");
  process.exit(1);
}

const replicate = new Replicate({ auth: token });

console.log(`[gen] model = ${model}`);
console.log(`[gen] prompt = ${prompt.slice(0, 90)}...`);

const output = await replicate.run(model, { input: { prompt } });

let url = Array.isArray(output) ? output[0] : output;
if (url && typeof url === "object" && typeof url.url === "function") url = url.url();
url = String(url);
console.log(`[gen] url = ${url}`);

const res = await fetch(url);
const buf = Buffer.from(await res.arrayBuffer());
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, buf);
console.log(`[gen] saved → ${out}  (${buf.length} bytes)`);
