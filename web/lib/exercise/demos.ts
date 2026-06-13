// 교정운동 "시범 아바타" — 외부 영상/이미지 없이 우리가 키프레임으로 그리는 스틱피겨.
// 정규화 좌표(0~1, x 오른쪽 / y 아래). 키프레임 사이를 보간해 반복 재생한다.

export type Joint =
  | "head"
  | "lSh"
  | "rSh"
  | "lEl"
  | "rEl"
  | "lWr"
  | "rWr"
  | "lHip"
  | "rHip"
  | "lKn"
  | "rKn"
  | "lAnk"
  | "rAnk";

export type DemoPose = Record<Joint, [number, number]>;

export const DEMO_CONNECTIONS: [Joint, Joint][] = [
  ["head", "lSh"],
  ["head", "rSh"],
  ["lSh", "rSh"],
  ["lSh", "lEl"],
  ["lEl", "lWr"],
  ["rSh", "rEl"],
  ["rEl", "rWr"],
  ["lSh", "lHip"],
  ["rSh", "rHip"],
  ["lHip", "rHip"],
  ["lHip", "lKn"],
  ["lKn", "lAnk"],
  ["rHip", "rKn"],
  ["rKn", "rAnk"],
];

// 기본 정면 서있는 자세
const STAND: DemoPose = {
  head: [0.5, 0.12],
  lSh: [0.4, 0.28],
  rSh: [0.6, 0.28],
  lEl: [0.36, 0.45],
  rEl: [0.64, 0.45],
  lWr: [0.34, 0.62],
  rWr: [0.66, 0.62],
  lHip: [0.44, 0.58],
  rHip: [0.56, 0.58],
  lKn: [0.43, 0.78],
  rKn: [0.57, 0.78],
  lAnk: [0.43, 0.96],
  rAnk: [0.57, 0.96],
};

const pose = (over: Partial<DemoPose>): DemoPose => ({ ...STAND, ...over });

// 팔 옆으로 들기: 내림 → 올림 반복
const ARM_UP = pose({
  lEl: [0.28, 0.3],
  rEl: [0.72, 0.3],
  lWr: [0.2, 0.16],
  rWr: [0.8, 0.16],
});

// 목 옆 스트레칭: 중립 → 오른쪽 → 중립 → 왼쪽
const NECK_R = pose({ head: [0.57, 0.15] });
const NECK_L = pose({ head: [0.43, 0.15] });

// 스쿼트: 서기 → 앉기(엉덩이 내림·무릎 굽힘·팔 앞으로)
const SQUAT = pose({
  lSh: [0.4, 0.34],
  rSh: [0.6, 0.34],
  lHip: [0.44, 0.64],
  rHip: [0.56, 0.64],
  lKn: [0.38, 0.74],
  rKn: [0.62, 0.74],
  lEl: [0.36, 0.46],
  rEl: [0.64, 0.46],
  lWr: [0.4, 0.5],
  rWr: [0.6, 0.5],
});

// 턱 당기기(측면 동작을 정면 도식으로 근사): 머리 앞·아래 → 뒤·위로 당겨 올림
const CHIN_FWD = pose({ head: [0.52, 0.19] });
const CHIN_TUCK = pose({ head: [0.5, 0.08] });

// 옆으로 다리 들기: 오른 다리를 옆으로 외전(무릎·발목 바깥·위로)
const LEG_OUT = pose({ rKn: [0.72, 0.72], rAnk: [0.86, 0.66] });

// 견갑거근 스트레칭: 머리를 비스듬히 숙여 겨드랑이 보기(좌/우) — 목보다 더 숙임
const LEV_R = pose({ head: [0.57, 0.21] });
const LEV_L = pose({ head: [0.43, 0.21] });

// 견갑 후인: 팔 앞으로 모음 → 팔꿈치 뒤로 당겨 날개뼈 모으기(손목 벌어짐)
const SCAP_FWD = pose({
  lEl: [0.43, 0.42],
  rEl: [0.57, 0.42],
  lWr: [0.47, 0.43],
  rWr: [0.53, 0.43],
});
const SCAP_BACK = pose({
  lSh: [0.41, 0.28],
  rSh: [0.59, 0.28],
  lEl: [0.3, 0.4],
  rEl: [0.7, 0.4],
  lWr: [0.28, 0.36],
  rWr: [0.72, 0.36],
});

// 흉근 스트레칭: 골대(goalpost) 팔 — 팔꿈치 어깨높이·전완 수직
const PEC = pose({
  lEl: [0.3, 0.28],
  rEl: [0.7, 0.28],
  lWr: [0.28, 0.12],
  rWr: [0.72, 0.12],
});

// 하부 승모근 Y레이즈: 양팔 머리 위 Y자
const Y_UP = pose({
  lEl: [0.33, 0.18],
  rEl: [0.67, 0.18],
  lWr: [0.25, 0.04],
  rWr: [0.75, 0.04],
});

// 한 발 균형: 오른 무릎 들고 팔 약간 벌려 균형
const BALANCE = pose({
  rKn: [0.6, 0.66],
  rAnk: [0.56, 0.76],
  lEl: [0.3, 0.42],
  rEl: [0.7, 0.42],
  lWr: [0.24, 0.42],
  rWr: [0.76, 0.42],
});

export const DEMOS: Record<string, { poses: DemoPose[]; periodMs: number }> = {
  "arm-raise": { poses: [STAND, ARM_UP], periodMs: 1600 },
  "neck-side-stretch": { poses: [STAND, NECK_R, STAND, NECK_L], periodMs: 3600 },
  squat: { poses: [STAND, SQUAT], periodMs: 1800 },
  "chin-tuck": { poses: [CHIN_FWD, CHIN_TUCK], periodMs: 1600 },
  "hip-abduction": { poses: [STAND, LEG_OUT], periodMs: 1600 },
  "levator-scapulae-stretch": { poses: [STAND, LEV_R, STAND, LEV_L], periodMs: 3600 },
  "scapular-retraction": { poses: [SCAP_FWD, SCAP_BACK], periodMs: 1500 },
  "pec-stretch": { poses: [STAND, PEC], periodMs: 2200 },
  "lower-trap-raise": { poses: [STAND, Y_UP], periodMs: 1600 },
  "single-leg-balance": { poses: [STAND, BALANCE], periodMs: 2400 },
};

// t(ms 누적)에서의 보간 포즈
export function poseAt(id: string, elapsedMs: number): DemoPose | null {
  const demo = DEMOS[id];
  if (!demo) return null;
  const { poses, periodMs } = demo;
  const seg = periodMs / poses.length; // 키프레임당 시간
  const phase = (elapsedMs % periodMs) / seg; // 0..poses.length
  const i = Math.floor(phase) % poses.length;
  const next = (i + 1) % poses.length;
  let f = phase - Math.floor(phase);
  f = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; // ease-in-out
  const a = poses[i];
  const b = poses[next];
  const out = {} as DemoPose;
  for (const k of Object.keys(a) as Joint[]) {
    out[k] = [a[k][0] + (b[k][0] - a[k][0]) * f, a[k][1] + (b[k][1] - a[k][1]) * f];
  }
  return out;
}
