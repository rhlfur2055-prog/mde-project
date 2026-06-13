import Link from "next/link";
import AuthButton from "@/components/AuthButton";

// posera 랜딩(SaaS형) — Posture AI/MWM(측정·리포트) + Umax(점수카드·freemium) + Kemtai/Onyx(실시간 코칭)
// 레퍼런스에서 차용: 정면+측면 촬영, 이상정렬 오버레이, 0~100 점수, 30일 플랜, 공유 카드, Free/Pro/전문가 티어.
// 모든 카피는 비진단(웰니스) 톤. 면책은 전역 footer(layout.tsx)에 고정.

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-bold tabular-nums text-black dark:text-zinc-50">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-zinc-400">{sub}</div>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="relative rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <span className="absolute -top-3 left-6 rounded-full bg-lime-400 px-2.5 py-0.5 text-xs font-bold text-black">
        {n}
      </span>
      <h3 className="mt-2 font-semibold text-black dark:text-zinc-50">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{desc}</p>
    </div>
  );
}

function Feature({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="text-2xl">{emoji}</div>
      <h3 className="mt-3 font-semibold text-black dark:text-zinc-50">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{desc}</p>
    </div>
  );
}

function PlanCard({
  name,
  price,
  period,
  highlight,
  features,
  cta,
  href,
  comingSoon,
}: {
  name: string;
  price: string;
  period: string;
  highlight?: boolean;
  features: string[];
  cta: string;
  href: string;
  comingSoon?: boolean; // 미구현 플랜 — 목업 CTA 대신 '출시 예정' 비활성
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        highlight
          ? "border-lime-400 bg-zinc-50 shadow-lg dark:bg-zinc-900"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {highlight && (
        <span className="mb-2 w-fit rounded-full bg-lime-400 px-2.5 py-0.5 text-xs font-bold text-black">
          가장 인기
        </span>
      )}
      <h3 className="font-semibold text-black dark:text-zinc-50">{name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums text-black dark:text-zinc-50">{price}</span>
        <span className="text-sm text-zinc-500">{period}</span>
      </div>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-lime-500">✓</span>
            {f}
          </li>
        ))}
      </ul>
      {comingSoon ? (
        <span className="mt-6 cursor-default rounded-full border border-dashed border-zinc-300 px-5 py-2.5 text-center text-sm font-medium text-zinc-400 dark:border-zinc-700">
          출시 예정
        </span>
      ) : (
        <Link
          href={href}
          className={`mt-6 rounded-full px-5 py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90 ${
            highlight
              ? "bg-foreground text-background"
              : "border border-zinc-300 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
          }`}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white dark:bg-black">
      {/* ── 네비 ── */}
      <header className="sticky top-0 z-10 border-b border-zinc-100 bg-white/80 backdrop-blur dark:border-zinc-900 dark:bg-black/70">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-black dark:text-zinc-50">
            posera
          </Link>
          <div className="hidden items-center gap-6 text-sm text-zinc-600 sm:flex dark:text-zinc-400">
            <a href="#how" className="hover:text-black dark:hover:text-zinc-50">작동 방식</a>
            <a href="#features" className="hover:text-black dark:hover:text-zinc-50">기능</a>
            <a href="#pricing" className="hover:text-black dark:hover:text-zinc-50">요금</a>
          </div>
          <div className="flex items-center gap-3">
            <AuthButton />
            <Link
              href="/capture"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              무료로 측정
            </Link>
          </div>
        </nav>
      </header>

      {/* ── 히어로 ── */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-800">
            🔒 온디바이스 분석 · 사진 서버 업로드 없음
          </span>
          <h1 className="mt-4 text-balance break-keep text-3xl font-bold leading-snug tracking-tight text-black md:text-[2.75rem] md:leading-tight dark:text-zinc-50">
            카메라 앞에 서면 <span className="text-lime-500">30초 만에</span> 내 자세 점수가 나와요.
          </h1>
          <p className="mt-4 max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            정면·측면으로 서기만 하면 AI가 <strong>거북목·라운드숄더·골반·다리 정렬</strong>을 분석해
            <strong> 0~100 점수와 황금비율(φ) 체형 점수</strong>를 매기고, <strong>아침·저녁 맞춤 루틴</strong>까지
            만들어 줍니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/capture"
              className="rounded-full bg-foreground px-6 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
            >
              무료로 자세 측정 →
            </Link>
            <Link
              href="/coach"
              className="rounded-full border border-zinc-300 px-6 py-3 text-base font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              실시간 코칭 체험
            </Link>
          </div>
          <div className="mt-8 flex gap-8">
            <Stat value="33점" label="실시간 골격 추적" />
            <Stat value="6+" label="자세 지표" />
            <Stat value="0원" label="첫 측정 무료" />
          </div>
        </div>

        {/* 점수 카드 목업(결과 화면과 동일 톤 — 공유 카드 프리뷰) */}
        <div className="mx-auto w-full max-w-sm rounded-3xl border border-zinc-200 bg-zinc-50 p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">종합 자세 점수</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-black dark:text-zinc-50">82</span>
              <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-semibold text-background">
                B
              </span>
            </div>
          </div>
          <div className="mt-2 font-mono text-xs text-lime-600">측정 신뢰도 91% · 24프레임 · 확인완료 ✓</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="좌우 대칭" value="90" sub="어깨 1.2° · 골반 0.8°" />
            <Metric label="황금비(φ)" value="75" sub="하체:상체 1.54 / 1.618" />
          </div>
          <div className="mt-3 rounded-xl bg-lime-50 px-3 py-2 text-xs text-lime-800 dark:bg-lime-950 dark:text-lime-300">
            🌅 아침: 견갑후인 2세트×10 · 🌙 저녁: 흉근 스트레칭 2세트×20초
          </div>
          <div className="mt-3 text-center text-[10px] text-zinc-400">예시 결과 카드 · 비의료 웰니스 참고용</div>
        </div>
      </section>

      {/* ── 작동 방식 ── */}
      <section id="how" className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          서고, 분석하고, 따라 하면 끝
        </h2>
        <p className="mt-2 text-center text-zinc-500">설치도 센서도 없이, 폰 카메라 하나로.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Step
            n={1}
            title="정면·측면으로 서기"
            desc="전신이 보이게 카메라 앞에 정면, 그다음 옆으로. 신뢰도가 충분해지면 자동으로 측정이 확정됩니다."
          />
          <Step
            n={2}
            title="AI가 골격을 분석"
            desc="실시간 스켈레톤으로 거북목(CVA)·라운드숄더·골반/어깨 기울기·O·X다리를 측정해 0~100 점수와 황금비를 산출."
          />
          <Step
            n={3}
            title="맞춤 루틴 + 진척 추적"
            desc="측정 결과로 아침·저녁 교정 루틴을 자동 생성. 2~4주 뒤 재측정해 전·후를 비교합니다."
          />
        </div>
      </section>

      {/* ── 기능 ── */}
      <section id="features" className="bg-zinc-50 py-16 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
            클리닉 수준 분석을, 손 안에서
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Feature emoji="🧍" title="6가지 자세 지표" desc="거북목·라운드숄더·골반 전방경사·어깨/골반 비대칭·O다리·X다리를 각도로 정량화." />
            <Feature emoji="📐" title="황금비율(φ) 체형 점수" desc="하체:상체 비율을 황금비 1.618 기준으로 채점. 좌우 대칭 점수와 함께 0~100으로." />
            <Feature emoji="🎥" title="실시간 폼 코칭" desc="카메라가 운동 자세를 보고 횟수·홀드를 자동 카운트하며 교정 피드백을 줍니다." />
            <Feature emoji="🌅" title="아침·저녁 맞춤 루틴" desc="감지된 문제에 맞춰 근력은 아침, 스트레칭은 저녁으로 묶은 하루 루틴을 자동 처방." />
            <Feature emoji="📈" title="전·후 진척 추적" desc="측정을 저장하고 시간에 따른 점수 변화를 비교. 개선이 눈에 보입니다." />
            <Feature emoji="🔒" title="온디바이스 프라이버시" desc="포즈 추론은 기기에서 실행. 사진/영상을 서버로 올리지 않습니다." />
          </div>
        </div>
      </section>

      {/* ── 공유/바이럴 ── */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
          내 점수, 카드 한 장으로 공유
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          측정 결과를 깔끔한 점수 카드로 만들어 친구·SNS에 공유하고, 같이 자세를 교정해 보세요.
          전·후 카드를 나란히 두면 변화가 한눈에 보입니다.{" "}
          <span className="text-zinc-400">(공유 카드 기능 준비 중)</span>
        </p>
        <Link
          href="/capture"
          className="mt-6 inline-block rounded-full bg-foreground px-6 py-3 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          내 점수 만들기 →
        </Link>
      </section>

      {/* ── 요금 ── */}
      <section id="pricing" className="bg-zinc-50 py-16 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-5xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
            먼저 무료로 측정해 보세요
          </h2>
          <p className="mt-2 text-center text-zinc-500">
            현재 <strong>무료 베타</strong> — 측정·코칭·진척은 지금 무료로 쓸 수 있고, 유료 플랜은 출시 예정입니다.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <PlanCard
              name="Free"
              price="0원"
              period=""
              features={["측정 1회 + 기본 점수", "당일 추천 루틴 1개", "실시간 골격 보기"]}
              cta="무료로 시작"
              href="/capture"
            />
            <PlanCard
              name="Pro"
              price="₩6,900"
              period="/월"
              highlight
              features={[
                "무제한 측정 + 황금비 상세",
                "아침·저녁 30일 루틴",
                "전·후 진척 그래프",
                "공유용 점수 카드 · PDF 리포트",
              ]}
              cta="Pro 시작하기"
              href="/capture"
              comingSoon
            />
            <PlanCard
              name="전문가"
              price="문의"
              period=""
              features={[
                "클라이언트 다중 관리",
                "브랜드 리포트 내보내기",
                "원격 운동 모니터링(RTM)",
                "전문가 페르소나 리포트",
              ]}
              cta="도입 문의"
              href="/capture"
              comingSoon
            />
          </div>
          <p className="mt-6 text-center text-xs text-zinc-400">
            가격은 출시 예정 기준의 예시이며 변경될 수 있습니다.
          </p>
        </div>
      </section>

      {/* ── 최종 CTA ── */}
      <section className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-black md:text-4xl dark:text-zinc-50">
          오늘 자세, 30초면 알 수 있어요
        </h2>
        <p className="mx-auto mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
          설치 없이 브라우저에서 바로. 첫 측정은 무료입니다.
        </p>
        <Link
          href="/capture"
          className="mt-6 inline-block rounded-full bg-lime-400 px-8 py-4 text-lg font-semibold text-black transition-opacity hover:opacity-90"
        >
          무료로 자세 측정하기 →
        </Link>
      </section>
    </div>
  );
}
