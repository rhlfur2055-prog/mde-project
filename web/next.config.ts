import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 상위 폴더(C:\tool)의 lockfile을 워크스페이스 루트로 오인하는 경고 방지 —
  // 이 web/ 디렉터리를 명시적 루트로 고정.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
