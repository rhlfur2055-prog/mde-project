import type { MetadataRoute } from "next";

// posera PWA manifest (설치형). 아이콘은 P7에서 정식 추가.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "posera — 황금비율 체형·자세 분석",
    short_name: "posera",
    description:
      "사진/영상으로 실제 자세를 보고, 황금비율 체형 점수와 10일 전후 진척을 추적하는 셀프 자세코칭.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ko",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
