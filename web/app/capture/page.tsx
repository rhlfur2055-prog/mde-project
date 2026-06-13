import PoseCamera from "@/components/PoseCamera";
import OnboardingGate from "@/components/OnboardingGate";
import CaptureGuide from "@/components/CaptureGuide";
import AuthButton from "@/components/AuthButton";

export default function CapturePage() {
  return (
    <OnboardingGate>
      <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
        <div className="flex w-full max-w-2xl justify-end">
          <AuthButton />
        </div>
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700">
            P1 · 온디바이스 자세 캡처
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            실제 자세 보기
          </h1>
          <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            카메라를 켜면 MediaPipe가 기기 안에서 직접 자세를 추정해 골격선을 그립니다.
            영상은 서버로 전송되지 않습니다.
          </p>
        </header>
        <CaptureGuide />
        <PoseCamera />
      </div>
    </OnboardingGate>
  );
}
