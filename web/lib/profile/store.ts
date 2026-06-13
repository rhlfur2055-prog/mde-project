// posera 프로필 스토어 — localStorage 우선(device.ts 패턴). 순수·결정적(시간 스탬프는 호출측이 부여).
// ⚠️ 신체데이터는 온디바이스 보관. Supabase profiles 테이블/RLS는 추가하지 않음(현재 DEV anon 정책이
//    전체 허용이라 spec의 RLS 격리 요건 위반). 로그인(auth.uid()) + RLS 도입 후 별도 작업으로
//    이 device-local 프로필을 계정에 마이그레이션할 것.
import { PROFILE_LIMITS, type UserProfile } from "./types";

const KEY = "posera_profile_v1";

// SSR/테스트 안전: localStorage 미존재 환경에선 null.
function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* 접근 차단 환경(쿠키 off 등) */
  }
  return null;
}

const SEXES = ["male", "female", "other", "unspecified"];
const inRange = (v: number, lo: number, hi: number) =>
  Number.isFinite(v) && v >= lo && v <= hi;

export function isValidProfile(p: unknown): p is UserProfile {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    o.schemaVersion === 1 &&
    typeof o.sex === "string" &&
    SEXES.includes(o.sex) &&
    typeof o.heightCm === "number" &&
    inRange(o.heightCm, PROFILE_LIMITS.HEIGHT_CM_MIN, PROFILE_LIMITS.HEIGHT_CM_MAX) &&
    typeof o.weightKg === "number" &&
    inRange(o.weightKg, PROFILE_LIMITS.WEIGHT_KG_MIN, PROFILE_LIMITS.WEIGHT_KG_MAX) &&
    typeof o.onboardedAt === "string"
  );
}

export function getProfile(): UserProfile | null {
  const s = ls();
  if (!s) return null;
  const raw = s.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return isValidProfile(p) ? p : null;
  } catch {
    return null;
  }
}

export function hasProfile(): boolean {
  return getProfile() !== null;
}

// 완성된 프로필을 그대로 영속화(onboardedAt 등 시간 스탬프는 호출측이 부여 → 스토어는 결정적).
export function saveProfile(profile: UserProfile): UserProfile {
  if (!isValidProfile(profile)) throw new Error("유효하지 않은 프로필");
  ls()?.setItem(KEY, JSON.stringify(profile));
  return profile;
}

export function clearProfile(): void {
  ls()?.removeItem(KEY);
}
