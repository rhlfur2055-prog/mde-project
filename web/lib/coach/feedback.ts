// 코칭 피드백 — 음성(Web Speech)·짧은 비프(WebAudio)·진동. 외부 의존성 0.
// 모두 브라우저 내장 API. 무음 모드면 호출측에서 막는다(on=false 전달).

let lastSpoken = "";
let lastSpokeAt = 0;

// 음성 큐(ko-KR). 같은 문구 연속/과빈도 방지(minGapMs). force=true면 즉시 교체 발화.
export function speak(text: string, on: boolean, opts?: { minGapMs?: number; force?: boolean }): void {
  if (!on || typeof window === "undefined" || !window.speechSynthesis || !text) return;
  const now = performance.now();
  const gap = opts?.minGapMs ?? 2500;
  if (!opts?.force && (text === lastSpoken || now - lastSpokeAt < gap)) return;
  lastSpoken = text;
  lastSpokeAt = now;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* 음성 미지원 — 무시 */
  }
}

export function resetSpeech(): void {
  lastSpoken = "";
  lastSpokeAt = 0;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }
}

// 짧은 비프(완료/카운트). AudioContext 는 사용자 제스처 이후 생성/재사용.
let audioCtx: AudioContext | null = null;
export function beep(on: boolean, freq = 880, ms = 120): void {
  if (!on || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + ms / 1000 + 0.02);
  } catch {
    /* 오디오 미지원 — 무시 */
  }
}

export function vibrate(on: boolean, pattern: number | number[] = 60): void {
  if (!on || typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}
