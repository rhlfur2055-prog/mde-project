# MedGate — Claude Code 작업 규칙

**프로젝트**: X-ray DICOM 업로드 → 비식별화 → AI 판정 → 보고서 초안 → 아레나(프롬프트 50개 서바이벌). Python + Streamlit 단일 앱.

## 매 세션 첫 행동
1. `spec.md`를 끝까지 읽는다 — **spec.md가 단일 진실**이며 이 파일·plan.md와 충돌 시 spec이 이긴다.
2. 레포 현재 상태를 점검한다: 파일 목록, `git log --oneline -5`, `pytest tests/ -q` — 어디까지 됐는지 파악 후 시작.

## 절대 규칙 (요약 — 전체는 spec.md §2·§8)
- Python + Streamlit만. FastAPI·Flask·별도 서버 금지. 외부 API는 Gemini만.
- `core/`는 streamlit import 금지 (순수 파이썬, pytest 대상).
- 이 폴더 밖 수정 금지 (plateguard·yolo11은 읽기 전용 참고).
- Mock·가짜 결과 금지. 실환자 데이터 금지.
- **검증 없는 "됐다" 금지** — 실행/테스트 로그 원문을 보여준 뒤에만 완료 선언.
- 한 번에 한 단계(spec §7). 단계 완료 → 커밋 → 보고 → 멈춤. 임의로 다음 단계 진행 금지.
- 모호하면 구현 전에 질문.

## 커밋
- 단계마다 1커밋, 한국어: `feat: D1 — DICOM 읽기·비식별화·업로드 화면`
