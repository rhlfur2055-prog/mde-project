// posera 프로그램 엔진 상수 — 단일 출처(SSOT). 매직넘버 0.
// 검출 "임계"는 자세 점수 임계(POSTURE)를 재사용한다(처방 임계와 정렬 — recommendExerciseIds 와 동일 기준).
// 본 파일은 심각도 정규화 스케일·보수적 처방량·클램프·볼륨 보정·최소 confidence 만 보유.

export const PROGRAM = {
  // 게이팅: 이 미만 confidence 면 처방 보류(재촬영 권고). agg.gatePassed=false 도 동일.
  MIN_CONFIDENCE: 0.5,

  // 심각도 정규화: "임계 초과분이 이 값(도)이면 severity=1". clamp(over/full, 0, 1).
  SEVERITY_FULL: {
    tiltDeg: 10, // 좌우 기울기류(어깨/골반/머리)
    cvaDeg: 20, // 거북목 CVA(임계 미만으로 더 작아지는 폭)
    protractionDeg: 20, // 라운드숄더 전방경사
    kneeDeg: 10, // 무릎 내/외반
  },

  // 보수적 기본 처방량(운동 정의에 reps/holdSec 있으면 그것을 우선, 없을 때 기본값).
  BASE: {
    sets: 2,
    reps: 10, // rep 모드 기본
    holdSec: 15, // hold 모드 기본
  },

  // 처방량 상·하한(clamp). 안전 위주.
  CLAMP: {
    setsMin: 1,
    setsMax: 3,
    repsMin: 5,
    repsMax: 15,
    holdMin: 10,
    holdMax: 30,
  },

  // 볼륨 보수적 조정(체중·연령) — 미용 목표 산출 금지. 안전 하향만(상향 없음).
  VOLUME: {
    highWeightKg: 90, // 이 이상 → 세트 1단계 하향
    olderAge: 60, // 이 이상 → 세트 1단계 하향
    downStep: 1, // 하향 폭(세트)
  },
} as const;
