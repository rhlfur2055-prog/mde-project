# posera 구현 명세 (spec.md) — 단일 진실

> 이 문서는 구현 에이전트를 위한 **계약**이다. plan.md(사람용 기획)와 충돌하면 **spec.md가 이긴다**.
> 모호하면 **구현하지 말고 질문**한다. 명세에 없는 기능을 임의로 추가하지 않는다.

## Context — medgate → posera 피벗 (2026-06)

이 레포는 X-ray DICOM 데모(medgate, Python+Streamlit)에서 **체형·자세 분석 PWA SaaS(posera)**로 피벗했다.
사진이 자동차→뼈→**사람 자세**로 바뀌었을 뿐, "입력 받기 → AI 판정 → 결과/리포트 주기 → 아레나로 최적화"라는 골격은 같다. Streamlit 사이트는 은퇴(`legacy/`)했고, 아레나/리포트 선발 로직(`core/arena.py`·`core/report.py`)과 Python 학습 자산(MURA 학습·진화선발)은 새 도메인으로 전용한다.

## 1. 제품 정의 (한 줄)

모바일 우선 **PWA**에서 사용자가 사진/영상을 올리면 → **실제 자세(골격)를 화면에 보여주고** → **황금비율(φ) 체형 점수·좌우대칭·자세편차**를 산출하고 → **10일 전/후 진척**을 추적하고 → **의사 페르소나 50명 아레나(상위 10 생존)**가 자세평가 리포트를 작성·채택하는 **체형·자세 분석 SaaS**. 참고 앱: Perfect Posture / iPosture / APECS(황금비율) / mBack.

## 2. 하드 제약 (위반 = 실패)

1. **프론트 = Next.js(App Router) + PWA.** 자세추정은 **MediaPipe Tasks for Web(Pose Landmarker, WASM/WebGPU)로 온디바이스** 실행. 별도 자체 백엔드 서버(FastAPI/Flask/Express 상시구동) 금지 — 서버 로직은 **Next.js API Route(서버리스)** 와 **Supabase**로만.
2. **YOLO 객체탐지는 "사람 검출 → ROI 크롭"** 용도로만. 웹에서는 **onnxruntime-web**로 실행(ONNX). 자세 키포인트는 MediaPipe가 담당.
3. 학습·모델 export·벤치는 **Python**(`ml/`). 외부 LLM은 **Gemini만**(`.env`의 `GEMINI_API_KEY`). 다른 유료 API 금지.
4. 백엔드 = **Supabase**(Auth + Postgres + Storage). 무료 조직, Seoul 리전, **RLS 필수**(사용자별 신체데이터 격리), 신규테이블 자동노출 끔. 비밀키는 `.env.local`(gitignore)만.
5. **이 폴더(C:\tool\posera) 밖을 수정하지 않는다.** `C:\tool\yolo11`·`C:\tool\yolo26-main`은 **읽기 전용 참고**(이식 출처) — import·sys.path 추가·수정 금지. 코드를 복사해와 posera 안에서 독립시킨다.
6. **비진단 원칙.** 의료 진단이 아니다. 모든 화면 하단 면책 고정(아래 §7). 의사 페르소나는 "리포트 문체/구성 선발"일 뿐 진단 주체가 아니다. "확진/병명 단정" 금지(게이트 §6).
7. **Mock·가짜 결과 금지.** 모델/연결이 없으면 "없음" 상태를 정직하게 표시. 실환자/타인 식별 데이터 금지.
8. `core/`(파이썬)는 streamlit·웹 프레임워크 import 금지 (순수 파이썬 — pytest 단독 테스트 가능).

## 3. 폴더 구조 (고정 — 변경 시 질문 먼저)

```
posera/                         # 기존 medgate 디렉터리
├── web/                        # Next.js PWA (제품 본체)
│   ├── app/                    #   페이지: 캡처·결과·진척(전후)·로그인
│   ├── lib/pose/               #   MediaPipe 래퍼, YOLO(onnxruntime-web) 래퍼, 2단계 파이프라인
│   ├── lib/golden/             #   황금비율·대칭·편차 점수 엔진 (순수 TS) + poseConfig.ts
│   ├── lib/supabase/           #   클라이언트·쿼리
│   ├── app/api/                #   서버리스: 아레나 리포트(Gemini) 등
│   └── public/manifest.json + service worker
├── ml/                         # Python 학습·export·벤치
│   ├── train_pose.py · export_onnx.py · bench.py · config.py
├── core/                       # arena.py·report.py(리포트 선발), config — 존치·전용
├── scripts/                    # train_mura·evaluate_mura·evolve_models 등(P6에서 ml/로 재편·prune)
├── supabase/                   # schema.sql, RLS 정책, migration
├── legacy/                     # 은퇴한 Streamlit app.py 등 (참조용 보존)
├── tests/                      # pytest (core/scripts), web 단위테스트는 web/ 내부
├── requirements.txt            # Python (학습·core)
└── CLAUDE.md / spec.md / plan.md
```

## 4. 핵심 화면 + 완료 기준(AC)

### ① 캡처 (web)
- 카메라(getUserMedia) 또는 업로드 → **YOLO 사람검출→ROI 크롭** → **MediaPipe 자세추정** → 캔버스에 **스켈레톤 오버레이(실제 자세)**.
- **AC**: 브라우저에서 실시간 스켈레톤이 그려지고, 추론 ms/FPS가 실측으로 표시된다.

### ② 결과 (체형 점수)
- 랜드마크 → 부위 비율(머리·몸통·다리 vs φ)·좌우대칭·자세편차 → 점수 카드·등급, 면책 고정.
- **AC**: 동일 입력에 결정적 점수(순수함수). 단위테스트 통과.

### ③ 진척 (10일 전/후)
- 로그인 후 스캔 저장(Supabase) → 이력 타임라인·트렌드 차트·**전/후 비교** 화면.
- **AC**: 두 계정이 서로의 데이터를 못 본다(RLS 실증). 전/후 비교 동작.

### ④ 아레나 리포트 (의사 50→10)
- `core/arena.py`로 **의사 페르소나 구성 50개**를 6차원 생성 → 케이스 채점 → 하드게이트·합성컷·쌍대결 → **1~10위 생존·40 해고** → 1등 구성이 ③/리포트의 운영 작성자로 채택. 리포트는 Next API Route에서 Gemini 호출.
- **AC**: 리더보드 생성·1등 채택 후 리포트가 그 구성으로 생성. 동일입력 재실행 시 LLM 0콜(캐시).

## 5. 아레나 규칙 (숫자 계약 — 기존 medgate 계약 유지, 도메인만 전환)

- **6차원**(페르소나): 역할 스타일(자세코치/물리치료 요약체/사용자 설명체…) · 신중도 · 어조 · 구조(소견→근거→권고) · 근거 표기 빈도 · 용어 난이도
- **하드 게이트(즉시 해고)**: ⓐ 진단 단정·면책 누락 1회 ⓑ JSON 구조 위반 ≥20% ⓒ 근거 표기 누락 ≥30%
- **채점 4축**: 정확성 35% · 케이스 적합도 25% · 근거 품질 20% · 구별성 20%(임베딩 코사인 ≥0.85 → 구별성 0점)
- **생존**: 합성 70 미만 탈락 → 70↑ 상위 15 쌍대결(3케이스) → 1~10위 생존, 40 해고
- **temperature**: 채점·심사 0 / 후보 생성 0.7
- **비용 가드**: 1회 LLM 호출 상한 `.env`의 `MAX_LLM_CALLS`(기본 700). 응답은 `data/cache/`에 캐시.

## 6. 리포트 게이트 규칙 (비진단)

- **금지어(부분 일치)**: "확진", "진단됩니다", "~병입니다", "치료하세요", "복용", "수술이 필요"
- **필수**: 모든 소견 문장에 "의심/가능성/확인 필요" 계열 + 근거 태그 `[자세분석]`/`[일반소견]`/`[불확실]` 중 하나
- 출력 JSON: `{"draft": str, "evidence_tags": [...], "gate": {"passed": bool, "violations": [...], "retries": int}}` — 3회 재시도 후에도 실패면 실패로 기록(가짜 통과 금지)

## 7. 면책 (모든 화면 하단 고정)

**"posera는 자세·체형 셀프 코칭을 돕는 웰니스 도구입니다. 의료 진단이 아니며, 통증·질환이 의심되면 의사·물리치료사와 상담하세요."**

## 8. 단계별 로드맵 (한 번에 한 단계 — 완료 후 멈추고 보고)

| 단계 | 구현 | 완료 기준 |
|---|---|---|
| **P0** | 피벗·스캐폴드: spec/CLAUDE 재작성·`web/` Next+PWA·Streamlit 은퇴·requirements 분리 | `npm run build`(web) 클린 + `pytest tests/ -q` 녹색 유지 |
| **P1** | `web` 카메라 → MediaPipe 자세추정 → 스켈레톤 오버레이 | ①AC (브라우저 캡처·ms/FPS 실측) |
| **P2** | YOLO 사람검출 ONNX export(`ml/`) → onnxruntime-web → ROI→Pose | 사람 ROI 크롭 후 자세추정 동작 |
| **P3** | 황금비율 점수 엔진(`web/lib/golden`) + poseConfig | ②AC + 점수 단위테스트 |
| **P4** | Supabase 스키마·RLS·Storage·Auth → 스캔 저장·진척·전후 비교 | ③AC (RLS 실증·전후 비교) |
| **P5** | 아레나 리포트(`core/arena.py` 도메인 전환) + Next API Route(Gemini) | ④AC (리더보드·채택·캐시) |
| **P6** | Python 학습 파이프라인: 외부 자세 데이터셋→학습→ONNX. `evolve_models`·`bench` 재사용. X-ray 모듈 prune | 학습 가중치로 자세점수/검출 개선, ml/ bench 실측 |
| **P7** | PWA 완성(manifest·SW·오프라인·설치형) + Vercel 배포 | 설치형 PWA·배포 URL 동작 |

## 9. 재사용 지도 (이식 출처 — 구현 전 필독)

| 출처(읽기전용) | 가져올 것 | 넣을 곳 |
|---|---|---|
| `yolo11/preprocessor.py` | CLAHE·감마LUT·deskew·저조도/역광 정규화 | `web/lib/pose/` 전처리 / `ml/` 증강 |
| `yolo11/plate_engine_pro.py` | 2단계 검출(전체→ROI)·프레임스킵·캐싱 | `web/lib/pose/` |
| `yolo11/config.py` | 네임스페이스 설정(임계·이상비율·허용오차) | `web/lib/golden/poseConfig.ts`, `ml/config.py` |
| `yolo11/bench_common.py`·`bench_fps.py` | 헤드리스 FPS/지연 실측 하네스 | `ml/bench.py` |
| `yolo26-main/master-clean` | 모듈화 파이프라인·앙상블 투표·IoU 트래커(골격 추적 전용)·회귀테스트 패턴 | `web/lib/pose/` 구조·`web` 테스트 |
| 기존 `core/arena.py`·`report.py` | 50→10 선발·하드게이트·캐시·DI 테스트 | 그대로, 프롬프트만 의사 페르소나로 |
| 기존 `scripts/evolve_models.py`·`train_mura.py` | 세대 진화 선발·GPU학습·OOM 재시도 | `ml/` (P6) |

**이식 규칙**: 출처 폴더 수정·import·sys.path 추가 금지. 모델 가중치(`best.pt`=번호판, `plate_ocr_crnn.pth`=한글OCR) 복사 금지(무용). CRNN/PaddleOCR/Tkinter/한글검증 미이식.

## 10. 작업 규칙 (하네스 — 매 응답에 적용)

1. **검증 없는 "됐다" 금지.** 만들면 실행/테스트하고 **실제 로그 원문(또는 브라우저 캡처)** 을 보인다. 1번 규칙.
2. **한 번에 한 단계.** 완료 시: 변경 파일 목록 + 로그 + 다음 단계 안내 후 **멈춘다**.
3. 새 패키지는 `requirements.txt`/`web/package.json`에 추가하고 이유 1줄.
4. 단계마다 git 커밋 1개, 한국어 메시지.
5. 모르는 것·모호한 것은 추측 말고 질문. 없는 파일·심볼 가정 금지(먼저 읽는다).
