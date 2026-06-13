import { describe, it, expect, beforeEach } from "vitest";
import { getProfile, hasProfile, saveProfile, clearProfile, isValidProfile } from "./store";
import type { UserProfile } from "./types";

// node 환경(localStorage 없음) → 최소 mock 주입
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

const sample: UserProfile = {
  sex: "male",
  heightCm: 175,
  weightKg: 70,
  ageYears: 30,
  goal: "posture",
  onboardedAt: "2026-06-13T00:00:00.000Z",
  schemaVersion: 1,
};

describe("profile store", () => {
  it("프로필 없으면 null / hasProfile false", () => {
    expect(getProfile()).toBeNull();
    expect(hasProfile()).toBe(false);
  });

  it("save → load 결정적 라운드트립(동일 객체)", () => {
    saveProfile(sample);
    expect(getProfile()).toEqual(sample); // 시간 스탬프 포함 동일
    expect(getProfile()).toEqual(getProfile()); // 반복 로드 동일
    expect(hasProfile()).toBe(true);
  });

  it("clear 후 다시 null", () => {
    saveProfile(sample);
    clearProfile();
    expect(getProfile()).toBeNull();
  });

  it("범위 밖/스키마 불일치는 무효", () => {
    expect(isValidProfile({ ...sample, heightCm: 9999 })).toBe(false);
    expect(isValidProfile({ ...sample, weightKg: 0 })).toBe(false);
    expect(isValidProfile({ ...sample, schemaVersion: 2 })).toBe(false);
    expect(isValidProfile({ ...sample, sex: "robot" })).toBe(false);
    expect(() => saveProfile({ ...sample, heightCm: 9999 })).toThrow();
  });

  it("손상된 JSON 저장값은 null 로 무시", () => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem(
      "posera_profile_v1",
      "{not json",
    );
    expect(getProfile()).toBeNull();
  });
});
