# MedGate 진행 로그 (PROGRESS.md)

> 자율 야간 실행 기록. 아침에 사람이 읽고 push/배포를 승인한다. (push·공개배포는 무인 실행 금지)

## 커밋 히스토리 (단계별)
- D1 (`9e00429`) — DICOM 읽기·비식별화·업로드 화면① + 테스트
- D2 (`78b1a94`) — 전처리(CLAHE·감마)·AI 판정(TorchXRayVision 베이스라인)·분석 화면②
- D3 (`38a01a8`) — 보관함 화면③ 목록/상세 + store 조회 확장
- D3.5 (`5811a7b`) — removed_tags PHI(old) 미영속화·미표시 (감리 수정)
- D4 (`2815373`) — 보고서 초안(Gemini)+품질 게이트+화면③ 생성 버튼
- D6-1 (`e7474dd`) — 아레나 채점 기준 10케이스(benchmark_cases.json)
- D6-2 (`6bf7555`) — core/arena.py 50구성 서바이벌 선발 + 단위테스트 11

## 자율 야간 실행 진행 (시작: 2026-06-12)
- [D5-3 부분] `b29e9e7` requirements 버전 핀 고정 + opencv-python→headless + torch CPU extra-index. 검증: cv2 headless import OK, pytest 48 passed.
- [D5-1] README.md 작성 — 번호판→X-ray 개조 스토리·4페이지·아키텍처·이식 출처·실측(bench 0.2/41.4ms)·면책·D7 로드맵. 아레나 풀런 수치/스크린샷은 TODO(풀런 완료 후 삽입).
- [대기] 아레나 풀런(구성50) 백그라운드 진행 중 — D6-3 최종검증(생존10/해고40·캐시0콜·1등채택→보고서) 대기. 30분 초과 시 케이스3·구성12 축소 폴백 예정.
- [참고] app.py에 st.secrets→os.environ 브리지 추가(배포 호환, D5-3) — page_arena(D6-3)와 같은 파일이라 D6-3 커밋에 동반 예정.
