// 운동별 "하이라이트할 자극 근육 + 위치"를 의사/운동생리 전문가가 정밀 매핑.
// 영상 생성 전에 어느 부위에 파란 발광을 넣을지 의학적으로 확정용. Gemini(웹 스택).
// 실행(web에서): node scripts/muscle-map.mjs
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: "../.env" });

const KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
if (!KEY) {
  console.error("GEMINI_API_KEY 없음");
  process.exit(1);
}

const EXERCISES = [
  { name: "맨몸 스쿼트", how: "무릎과 엉덩이를 굽혀 앉았다 일어섬" },
  { name: "팔 옆으로 들기(레터럴 레이즈)", how: "양팔을 옆으로 어깨 높이까지 들었다 내림" },
  { name: "목 옆 스트레칭", how: "머리를 한쪽 어깨로 기울여 반대쪽 목을 늘림" },
];

async function map(ex) {
  const prompt = `당신은 스포츠의학·해부학 전문의입니다.
운동: ${ex.name} (${ex.how})

이 운동의 시범 영상에서 "자극되는 근육"을 파란 발광으로 표시하려 합니다.
의학적으로 정확하게, JSON만 출력:
{
 "primary": [{"muscle":"근육 한글명", "location":"몸의 정확한 위치(예: 앞허벅지 중앙)", "role":"왜 자극되는지 한줄"}],
 "secondary": [{"muscle":"보조/안정근", "location":"위치"}],
 "highlight_zones": ["영상에서 파랗게 빛낼 부위들(우선순위)"]
}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    },
  );
  const d = await res.json();
  const t = d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "ERR:" + JSON.stringify(d?.error ?? d).slice(0, 150);
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t };
  }
}

for (const ex of EXERCISES) {
  const m = await map(ex);
  console.log(`\n━━━━━ ${ex.name} ━━━━━`);
  if (m.raw) {
    console.log(m.raw);
    continue;
  }
  console.log("【주동근(파랑 핵심)】");
  for (const p of m.primary ?? []) console.log(`  • ${p.muscle} (${p.location}) — ${p.role}`);
  console.log("【보조/안정근】");
  for (const s of m.secondary ?? []) console.log(`  • ${s.muscle} (${s.location})`);
  console.log("【영상 하이라이트 부위】", (m.highlight_zones ?? []).join(" / "));
}
