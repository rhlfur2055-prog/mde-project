// 로그인 없는 단계의 사용자 식별 — 기기별 UUID(localStorage).
// 로그인(P4b) 붙으면 이 device_id를 계정에 연결한다.
const KEY = "posera_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
