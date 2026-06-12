# posera — Claude Code 작업 규칙

**프로젝트**: 모바일 우선 PWA로 사진/영상을 올리면 → **실제 자세(골격)를 보여주고** → **황금비율(φ) 체형 점수·좌우대칭·자세편차**를 산출하고 → **10일 전/후 진척**을 추적하고 → **의사 페르소나 50명 아레나(상위 10 생존)**가 자세평가 리포트를 쓰는 **체형·자세 분석 SaaS**.
(이전 정체성: medgate = X-ray DICOM 데모. 2026-06 posera로 피벗 — 자세한 전환 배경은 `spec.md` Context.)

## 매 세션 첫 행동
1. `spec.md`를 끝까지 읽는다 — **spec.md가 단일 진실**이며 이 파일·plan.md와 충돌 시 spec이 이긴다.
2. 레포 상태 점검: 파일 목록, `git log --oneline -5`, `pytest tests/ -q`(Python), `cd web && npm test`(있을 때) — 어디까지 됐는지 파악 후 시작.

## 절대 규칙 (요약 — 전체는 spec.md §2·§8)
- **프론트 = Next.js(App Router) + PWA + MediaPipe Tasks for Web(온디바이스 추론)**. 학습·배치 = **Python**. 백엔드 = **Supabase**. 외부 LLM은 **Gemini만**.
- `core/`(파이썬)는 streamlit·웹 프레임워크 import 금지 (순수 파이썬, pytest 대상). 아레나/리포트 선발 로직의 집.
- 이 폴더(C:\tool\posera = 기존 medgate 경로) 밖 수정 금지. `C:\tool\yolo11`·`C:\tool\yolo26-main`은 **읽기 전용 참고**(코드 패턴 이식 출처) — 절대 수정·import·sys.path 추가 금지.
- **비진단 원칙**: 의료 진단 아님. 모든 화면 하단 면책 고정. 의사 페르소나는 "리포트 문체 선발"일 뿐 진단 주체 아님.
- Mock·가짜 결과 금지. 실환자/타인 식별 데이터 금지. 신체데이터는 RLS로 사용자 격리.
- 비밀키 금지: Supabase service_role·Gemini 키는 `.env`/`.env.local`(gitignore)에만. 커밋 금지.
- **검증 없는 "됐다" 금지** — 실행/테스트 로그 원문(또는 브라우저 캡처)을 보여준 뒤에만 완료 선언.
- 한 번에 한 단계(spec §7 로드맵). 단계 완료 → 커밋 → 보고 → 멈춤. 임의로 다음 단계 진행 금지.
- 모호하면 구현 전에 질문.

## 커밋
- 단계마다 1커밋, 한국어: `feat: P1 — 온디바이스 자세 캡처(MediaPipe 스켈레톤)`
