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

export const DEMOS: Record<string, { poses: DemoPose[]; periodMs: number }> = {
  "arm-raise": { poses: [STAND, ARM_UP], periodMs: 1600 },
  "neck-side-stretch": { poses: [STAND, NECK_R, STAND, NECK_L], periodMs: 3600 },
  squat: { poses: [STAND, SQUAT], periodMs: 1800 },
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
