// 진짜 Gemini API(Veo)로 운동 시범 영상 1개 생성.
// GEMINI_API_KEY 사용(.env.local 또는 루트 .env). ⚠️ 1회 = 과금. Veo는 비쌈.
// 워터마크(✦)는 Veo가 강제로 박으므로 생성 후 ffmpeg delogo로 제거(별도 단계).
//
// 실행(web에서):
//   node scripts/gen-veo.mjs --model veo-3.0-fast-generate-001 --out public/exercises/squat/_veo-raw.mp4
import { config } from "dotenv";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });
config({ path: "../.env" });

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("GEMINI_API_KEY 없음");
  process.exit(1);
}
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const model = arg("model", "veo-3.0-fast-generate-001");
const out = arg("out", "public/exercises/squat/_veo-raw.mp4");
const imgPath = arg("image", null); // 있으면 image-to-video(같은 사람 일관성)

// 사용자가 말한 규칙: 정면 · 완벽한 스쿼트 · 적당히 몸 좋은 사람 · 천천히 · 반복 사이 멈춤 · 깨끗한 배경
const PROMPT = arg(
  "prompt",
  "A moderately fit Korean man, front view facing the camera, full body head to feet, " +
    "wearing a grey tank top and black shorts, performing ONE slow and controlled bodyweight squat " +
    "with textbook-perfect form: feet shoulder-width, knees tracking over toes, thighs lowering to parallel, " +
    "back straight, then standing back up slowly and pausing upright for a moment before the next rep. " +
    "Calm gym demonstration pace, smooth and deliberate, no fast motion. " +
    "Plain seamless light-grey studio background, soft even lighting, the person centered. " +
    "No on-screen text, no captions, no logos.",
);
const NEG = arg(
  "neg",
  "fast motion, jumping, talking, multiple people, text, captions, watermark, logo, distorted limbs, extra limbs",
);

const base = "https://generativelanguage.googleapis.com/v1beta";

console.log(`[veo] model = ${model}`);
console.log(`[veo] prompt = ${PROMPT.slice(0, 100)}...`);

// 1) 생성 작업 시작
const instance = { prompt: PROMPT };
if (imgPath) {
  const ib = await readFile(imgPath);
  const mime = imgPath.endsWith(".png") ? "image/png" : "image/jpeg";
  instance.image = { bytesBase64Encoded: ib.toString("base64"), mimeType: mime };
  console.log(`[veo] image-to-video 시작이미지 = ${imgPath}`);
}
const startRes = await fetch(`${base}/models/${model}:predictLongRunning?key=${KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    instances: [instance],
    parameters: { aspectRatio: "16:9", negativePrompt: NEG },
  }),
});
const startJson = await startRes.json();
if (!startRes.ok) {
  console.error("[veo] 시작 실패", startRes.status, JSON.stringify(startJson).slice(0, 500));
  process.exit(1);
}
const opName = startJson.name;
console.log(`[veo] operation = ${opName}`);

// 2) 폴링 (최대 ~6분)
let op = null;
for (let i = 0; i < 36; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const pr = await fetch(`${base}/${opName}?key=${KEY}`);
  op = await pr.json();
  process.stdout.write(`  …polling ${(i + 1) * 10}s done=${op.done ? "Y" : "n"}\n`);
  if (op.done) break;
}
if (!op?.done) {
  console.error("[veo] 시간초과 — 작업 미완료");
  process.exit(1);
}
if (op.error) {
  console.error("[veo] 작업 에러", JSON.stringify(op.error).slice(0, 500));
  process.exit(1);
}

// 3) 결과에서 비디오 uri 또는 base64 추출 (구조 방어적 파싱)
const blob = JSON.stringify(op.response ?? op);
const uriMatch = blob.match(/"uri"\s*:\s*"([^"]+)"/);
const b64Match = blob.match(/"(?:bytesBase64Encoded|videoBytes)"\s*:\s*"([^"]+)"/);

let buf;
if (uriMatch) {
  let uri = uriMatch[1];
  if (!/[?&]key=/.test(uri)) uri += (uri.includes("?") ? "&" : "?") + "key=" + KEY;
  console.log(`[veo] 다운로드 uri = ${uri.slice(0, 90)}...`);
  const vr = await fetch(uri);
  if (!vr.ok) {
    console.error("[veo] 다운로드 실패", vr.status);
    process.exit(1);
  }
  buf = Buffer.from(await vr.arrayBuffer());
} else if (b64Match) {
  buf = Buffer.from(b64Match[1], "base64");
} else {
  console.error("[veo] 결과에서 비디오를 못 찾음:", blob.slice(0, 600));
  process.exit(1);
}

await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, buf);
console.log(`[veo] 저장 → ${out} (${buf.length} bytes)`);
