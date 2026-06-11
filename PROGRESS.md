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
- [참고] app.py에 st.secrets→os.environ 브리지 추가(배포 호환, D5-3) — page_arena(D6-3)와 같은 파일이라 D6-3 커밋에 동반.
- [D6-3] 아레나 풀런(구성50) 검증 완료 + 화면④/report 채택연계 커밋. 검증:
  - 콜드런 **호출 243/700**(상한 이내), **생존 10 / 해고 40**. 해고 사유: 하드게이트 6·70미만 13·상위15밖 16·쌍대결탈락 5.
  - **재실행 캐시 → 0콜**(④AC). 1등 채택(config_25)→보고서 gate.passed=True, 초안이 채택 스타일(소견→근거→권고·전문가용·[AI결과]·면책) 따름.
  - pytest 48 passed.
  - **1등 config_25 4축**: 정확성 100·적합도 100·근거 99·구별성 0.0 → 합성 79.8, 쌍대결 승 13/14.
  - **과적합 점검**: 생존10 합성 76.4~79.8(상하 3.4점차)로 빡빡한 군집, 정확성은 10케이스 평균이라 단일케이스 과적합 아님. 1등 13승으로 명확한 우위 — 합리적.
  - **구별성 작동**: 생존10 전원 구별성=0.0 ⚠️ — 같은 10케이스 보고서 임베딩이 코사인≥0.85로 군집해 구별성 축(20%)이 전원 0점. 즉 선발은 사실상 정확성·적합도·근거+쌍대결로 결정됨. 구성 자체는 역할(영상의학/교육/환자설명/간결메모)·구조 다양해 완전 동일은 아니나, **임베딩 구별성 지표가 동일 케이스 텍스트에선 변별력 약함**. 개선여지: 케이스별 분산 임베딩 또는 스타일 전용 임베딩(D7+ 검토).
- [D5-1 보강] `840cc5e` 후속 — README 아레나 실측 채움: 243콜/생존10/해고40/재실행0콜 + 생존 리더보드 표(1등 config_25) + 구별성=0 주의. **스크린샷 이미지는 표로 대체**(라이브 캡처는 헤드리스 무인에서 비효율 → 아침에 사람이 ④에서 캡처, README에 표시). 데이터는 커밋된 풀런 로그와 일치.
- [D5-2] `6370424` DEMO_READONLY 안전장치.
- [5번 배포 사전점검] **통과** — (1) .env 미추적(추적 env는 .env.example만), (2) 하드코딩 키 grep 0건, (3) 서드파티 import(cv2/google/numpy/pydicom/pytest/streamlit/torch/torchvision/torchxrayvision) 전부 requirements 포함. 참고: python-dotenv는 목록에 있으나 현재 미사용(report.py가 BOM 안전 위해 .env 수동 파싱) — 무해, 유지. ★ push·공개배포는 사람이 아침에. core/config.py(순수 readonly 플래그) + app.py 전 페이지 버튼 disabled+잠금안내(업로드/분석/보고서/아레나 실행/1등 채택) + 사이드바 배너. 검증: AppTest로 readonly 시 아레나/채택 버튼 disabled·잠금안내 노출, 비-readonly 시 활성 — 3 passed. 전체 51 passed. DEMO_READONLY=true 헤드리스 부팅 health 200.
- [D7 6-1] core/mura_dataset.py — MURA 폴더 파서(positive/negative 마커 라벨 + ImageFolder 폴백, CSV 교차검증 TODO). 검증: 더미 이미지로 라벨링 3 passed.
- [D7 6-2] scripts/train_mura.py — DenseNet 파인튜닝(정상/비정상 2-class) 골격, --data/MURA_DIR·--steps·--arch·--pretrained. 검증: 더미 4장 densenet121 2 step 실학습 도는 것 확인(loss 0.69→), 모델 저장. 1 passed.
- [D7 6-3] core/infer.py MURA 로더+폴백 — MURA_MODEL(.pt) 있으면 DenseNet169 2-class 근골격 추론, 없으면 흉부 베이스라인 폴백. predict 인터페이스 불변. 검증: 폴백·MURA채택 2 passed, 전체 57 passed.
- [D7 6-5] scripts/evaluate_mura.py — "영상 아레나": .pt 모델들을 MURA 정답으로 채점→정확도/민감도/특이도 리더보드(정확도순)→1등 채택 후보. 검증: 더미 모델 2·이미지 4로 리더보드 파이프라인 1 passed.
- [D7 6-4/6-6] docs/D7_PLAN.md — 아침 실행 체크리스트(MURA 신청 URL·다운로드·라벨 CSV 교차검증·학습·영상아레나 평가·1등 채택·화면② 한계문구 제거 위치 app.py:134/126/234) + "영상 아레나" 절차. 검증: 문서 참조 심볼(MURA_MODEL/ARCH·label_from_path·train/evaluate 옵션·한계문구) 코드 실재 확인. 6번(D7 준비) 완료.
- [D8 7-1/7-3] scripts/pacs_scp.py — pynetdicom C-STORE SCP 수신 서버 골격(수신→dicom_io→deid→store, status=received(PACS)). pynetdicom 미설치 시 정직 종료. requirements pynetdicom==3.0.4 추가. 검증: 서버 기동·종료 + 미설치 폴백 2 passed, 전체 60 passed.
- [D8 7-2] docs/D8_PLAN.md — 아침 체크리스트(수신서버 기동·Orthanc 설치·storescu 전송 시연·보관함 확인·README 업로드vs수신 차이 위치). Orthanc·실전송은 사람이.
- [7번 D8 준비 완료] push·공개배포·Orthanc 실전송 금지 유지.

## 🌅 야간 실행 최종 요약 (완료 — 사람 확인 대기)
**전부 완료. 검증 없는 커밋 없음. push/공개배포/실데이터 다운로드/실학습/Orthanc 실전송은 일절 안 함(사람 몫).**

- 최종 테스트: **pytest 60 passed**. 최종 앱 부팅 health 200.
- 배포 사전점검 통과: .env 미추적(`.env.example`만), 하드코딩 키 0건, requirements 완전, **remote 없음=미push**(로컬 19 커밋).
- 아레나 풀런 실증: 콜드런 243/700콜·생존10/해고40, 재실행 캐시 0콜, 1등 config_25 채택→보고서 연계. (구별성 전원 0 = 동일케이스 임베딩 군집, 정직 기록)

### 아침에 사람이 할 일 (자동 실행 금지였던 것들)
1. **git push** — 검토 후 직접. (무인 push 금지였음)
2. **공개 배포** — Streamlit Cloud 등. DEMO_READONLY=true + GEMINI_API_KEY를 st.secrets로.
3. **README 아레나 스크린샷** — 라이브 ④에서 캡처(현재는 데이터 표로 대체).
4. **D7(MURA)** — `docs/D7_PLAN.md`대로: 데이터 신청·다운로드→train_mura→evaluate_mura(영상 아레나)→1등 채택→화면② 한계문구 제거(app.py:134/126/234).
5. **D8(PACS)** — `docs/D8_PLAN.md`: 수신서버 기동·Orthanc 설치·storescu 전송 시연.

### 알려진 한계/메모
- 구별성 축이 동일 케이스에서 변별력 약함(전원 0) — D7+ 개선여지.
- infer 베이스라인은 흉부(도메인 외) — MURA_MODEL 있으면 자동 교체(폴백 구조 완료).
- python-dotenv는 requirements에 있으나 미사용(report.py 수동 .env 파싱) — 무해.
