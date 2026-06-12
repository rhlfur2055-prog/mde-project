import { defineConfig } from "vitest/config";
import path from "node:path";

// tsconfig의 "@/*" → 프로젝트 루트 별칭을 vitest에도 알려준다.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
