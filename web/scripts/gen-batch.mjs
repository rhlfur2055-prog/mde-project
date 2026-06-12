// 같은 캐릭터(image-to-video)로 운동 시범 영상 일괄 생성 — 글로우/하이라이트 없는 깨끗한 버전.
// 필터(RAI) 걸리면 무료라 자동 재시도. 결과는 /tmp에 저장 → 검증 후 수동 배치.
// 실행(web에서): node scripts/gen-batch.mjs
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";

config({ path: ".env.local" });
config({ path: "../.env" });

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY 없음"); process.exit(1); }
const MODEL = process.env.VEO_MODEL || "veo-3.0-fast-generate-001";
const base = "https://generativelanguage.googleapis.com/v1beta";
const NEG =
  "turned body, rotated stance, angled stance, three-quarter view, oblique angle, side view, twisting, " +
  "blue glow, colored highlight, glowing body parts, neon, markings on skin, fast motion, jumping, " +
  "talking, multiple people, text, captions, watermark, logo, distorted limbs, extra limbs, extra fingers";

const OUTFIT = {
  man: "grey tank top and black shorts",
  woman: "grey tank top and black leggings",
};
const CLEAN = "Natural skin and clothing only, no colored highlights, no glow, no markings anywhere, no text, no captions, no logos.";

const move = {
  squat: (o) =>
    `The same person slowly performs a controlled bodyweight squat: feet shoulder-width apart, lowering the hips until the thighs are about parallel to the floor with knees tracking over the toes and the back straight, then standing back up slowly and pausing upright for a moment before the next repetition. Calm deliberate gym-demonstration pace. Front view, full body head to feet, same ${o}, same plain seamless light-grey studio background, soft even lighting, smooth slow motion. ${CLEAN}`,
  "arm-raise": (o) =>
    `The same person slowly raises both arms straight out to the sides up to shoulder height, then slowly lowers them back down, repeating this lateral raise in a calm controlled tempo with a brief pause when the arms are down. Front view, full body, same ${o}, same plain seamless light-grey studio background, smooth slow motion. ${CLEAN}`,
  "neck-side-stretch": (o) =>
    `The same person slowly tilts the head toward one shoulder to gently stretch the side of the neck, holds for a moment, returns the head to center, then tilts toward the other shoulder, keeping shoulders relaxed and down. Calm gentle slow motion. Front view, head and upper body clearly visible, full body in frame, same ${o}, same plain light-grey studio background. ${CLEAN}`,
};

// 여자 영상만 재생성 (정면 기준으로 교체했으므로). squat-woman 은 이미 완료 → 남은 2개.
const JOBS = [
  { ex: "arm-raise", g: "woman" },
  { ex: "neck-side-stretch", g: "woman" },
];

async function genOne(ex, g) {
  const img = await readFile(`.veo-refs/${g}.jpg`);
  const prompt = move[ex](OUTFIT[g]);
  const body = JSON.stringify({
    instances: [{ prompt, image: { bytesBase64Encoded: img.toString("base64"), mimeType: "image/jpeg" } }],
    parameters: { aspectRatio: "16:9", negativePrompt: NEG },
  });
  const s = await fetch(`${base}/models/${MODEL}:predictLongRunning?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  const sj = await s.json();
  if (!s.ok) return { err: `start ${s.status}: ${JSON.stringify(sj).slice(0, 200)}` };
  const op = sj.name;
  let done = null;
  for (let i = 0; i < 36; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const pr = await fetch(`${base}/${op}?key=${KEY}`);
    done = await pr.json();
    if (done.done) break;
  }
  if (!done?.done) return { err: "timeout" };
  const blob = JSON.stringify(done.response ?? done);
  const filt = blob.match(/"raiMediaFilteredReasons"\s*:\s*\["([^"]+)"/);
  if (filt) return { filtered: filt[1] };
  const uri = blob.match(/"uri"\s*:\s*"([^"]+)"/);
  if (!uri) return { err: "no video: " + blob.slice(0, 200) };
  let u = uri[1];
  if (!/[?&]key=/.test(u)) u += (u.includes("?") ? "&" : "?") + "key=" + KEY;
  const vr = await fetch(u);
  if (!vr.ok) return { err: "download " + vr.status };
  return { buf: Buffer.from(await vr.arrayBuffer()) };
}

for (const j of JOBS) {
  const tag = `${j.ex}-${j.g}`;
  let placed = false;
  for (let attempt = 1; attempt <= 8; attempt++) {
    process.stdout.write(`[${tag}] 시도 ${attempt}… `);
    const r = await genOne(j.ex, j.g);
    if (r.buf) {
      const out = `/tmp/g-${tag}.mp4`;
      await writeFile(out, r.buf);
      console.log(`✅ 저장 ${out} (${r.buf.length} bytes)`);
      placed = true;
      break;
    }
    if (r.filtered) { console.log(`⚠️필터(무료): ${r.filtered.slice(0, 60)} → 재시도`); continue; }
    if (r.err && r.err.includes("429")) {
      console.log("⏳429(분당제한) → 90초 대기 후 재시도");
      await new Promise((res) => setTimeout(res, 90000));
      continue;
    }
    console.log(`❌ ${r.err}`);
    break;
  }
  if (!placed) console.log(`[${tag}] 실패 — 건너뜀`);
}
console.log("\n배치 완료.");
