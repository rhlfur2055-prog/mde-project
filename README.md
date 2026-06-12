# MedGate — X-ray DICOM 비식별 → AI 판정 → 보고서 초안 → 아레나

> **본 서비스는 교육·기술 데모입니다. 의료 진단이 아니며, 모든 의료적 판단은 의사와 상담하세요.**

X-ray DICOM 파일을 업로드하면 → 개인정보를 **비식별화**하고 → AI가 **정상/이상을 판정**하고 →
품질 게이트를 통과한 **보고서 초안**을 만들어 → **보관함**에서 조회하는 **Streamlit 단일 앱**.
4페이지째 **"아레나"** 는 보고서 작성 프롬프트 구성 50개를 경쟁시켜 1등을 운영에 채택한다.

Python 3.12+ (3.13 검증) · Streamlit · 외부 API는 Gemini만 · 저장은 SQLite 파일.

---

## "번호판 → X-ray" 개조 스토리

이 프로젝트는 차량 **번호판 익명화/인식 파이프라인**(plateguard·yolo11)의 검증된 컴퓨터비전·DB
패턴을 **의료영상 도메인으로 개조**해 만들었다. 같은 엔지니어링 뼈대를 다른 도메인에 이식한 사례:

| 원본 (번호판) | 이식 → MedGate (X-ray) |
|---|---|
| `plateguard/app/core.py` 의 박스 검출→모자이크/블러 | `core/deid.py` — **픽셀에 박힌 글자영역** 블러 (번호판 대신 burned-in 텍스트) |
| `yolo11/preprocessor.py` 의 CLAHE·감마·정규화 (BGR/LAB) | `core/preprocess.py` — X-ray **그레이스케일** 보정으로 단순화 이식 |
| `yolo11/db.py` 의 SQLite 캡슐화 패턴 | `core/store.py` — studies/analyses 스키마로 재작성 |
| `plateguard/scripts/_bench.py` 의 단계별 실측 | `scripts/bench.py` — 전처리/추론 ms 실측 |

> 핵심 전이 가능 역량: **민감정보 비식별(번호판=PHI)**, 이미지 전처리, 경량 추론 파이프라인, 감사 로그형 저장.

---

## 4페이지 구성

1. **① 업로드** — `.dcm` 업로드 → 식별 태그 제거/치환 + 픽셀 글자영역 블러 → 좌(원본)/우(비식별) 비교 + 제거 태그 표 → SQLite 기록. (원본 PHI는 디스크에 저장하지 않음)
2. **② 분석** — 보관함 항목 선택 → 전처리→추론→저장 단계 표시 → 결과 카드(라벨·확신도·**실측 처리시간**). 재분석 시 캐시 즉시 반환.
3. **③ 보관함** — 목록(비식별ID·일시·부위·상태·판정) → 상세(비식별 이미지·제거 태그·분석 카드) → **보고서 초안 생성**(품질 게이트 통과본만 표시 + 게이트 리포트).
4. **④ 아레나** — 보고서 작성 프롬프트 구성 50개를 6차원으로 생성 → 10케이스 채점 → 생존 10/해고 40 리더보드 → **1등 채택** 시 이후 보고서가 그 구성으로 생성.

---

## 입력 경로 — 파일 업로드 vs PACS 네트워크 수신 (D8)

같은 처리(비식별→판정→저장)를 두 경로로 받는다:
- **① 파일 업로드** (화면①) — 사람이 `.dcm`을 끌어다 놓음.
- **PACS C-STORE 네트워크 수신** (`scripts/pacs_scp.py`) — 병원 PACS처럼 DICOM을 네트워크로 받음.

**실 C-STORE 전송 시연 로그** (pynetdicom `storescu` → medgate SCP, 실제 DICOM association):
```
[PACS] C-STORE SCP 기동: AET=MEDGATE port=11112
[PACS] 수신: Modality=CT PatientName=CompressedSamples^CT1
[PACS] 비식별: 식별태그 4개 제거/치환, 블러 0개
[PACS] 추론: 이상 소견 의심 (78.3%) model=densenet121-res224-all 587ms
[PACS] 저장 완료: studies.id=1 status=received(PACS)
```
→ 수신 DICOM이 `dicom_io→deid→preprocess→infer→store` 파이프라인을 실제로 탄다.
보관함(③)에 `status=received(PACS)` 항목으로 나타난다. (Orthanc 연동 절차는 `docs/D8_PLAN.md`)

## 아키텍처

```
app.py (Streamlit, 화면 코드만)
└─ core/  (순수 파이썬 — streamlit import 금지, pytest 단독 테스트)
   ├─ dicom_io.py   DICOM 읽기 → 메타데이터 + 픽셀 numpy
   ├─ deid.py       식별 태그 제거/치환 + 글자영역 블러 (PHI 미영속화)
   ├─ preprocess.py 정규화·CLAHE·감마 (X-ray 보정)
   ├─ infer.py      predict(img)->{label,confidence} — TorchXRayVision 베이스라인
   ├─ report.py     보고서 초안(Gemini) + 품질 게이트(순수함수)
   ├─ store.py      SQLite (studies, analyses)
   └─ arena.py      구성 50개 생성→채점→해고→1등 채택
data/  benchmark_cases.json(채점 정답지) · medgate.db · cache/ (db·cache·런타임 산출물은 gitignore)
```

- **품질 게이트**(`report.check_gate`)는 LLM과 분리된 순수 함수 — 금지어 차단·필수 헤지 표현·근거 태그 강제. API 없이 단위테스트.
- **비용 가드**: 아레나 1회 실행 LLM 호출 상한 `MAX_LLM_CALLS`(기본 700), (구성×케이스) 응답 캐시 → 재실행 0콜.

---

## 실측 수치

- **전처리/추론 처리시간** (`python -m scripts.bench`, 샘플 CT_small.dcm, N=20, CPU):
  - 전처리(정규화·CLAHE·감마): **0.2 ms**
  - 추론(TorchXRayVision): **41.4 ms**
  - 합계: **41.6 ms**
- **테스트**: `pytest tests/ -q` → **48 passed** (Gemini 불필요 — 게이트·채점·해고 로직은 가짜 응답으로 검증)
- **아레나 풀런** (구성 50 × 케이스 10, 실제 Gemini): **LLM 호출 243/700**(상한 이내), **생존 10 / 해고 40**.
  재실행 시 **캐시로 0콜**. 해고 사유: 하드게이트 6 · 합성 70미만 13 · 상위15밖 16 · 쌍대결 탈락 5.

  생존 리더보드 (1등 `config_25` 채택 → 이후 보고서가 이 구성으로 생성):

  | 순위 | 구성 | 합성 | 정확성 | 적합도 | 근거 | 구별성 | 승수 | 역할/구조 |
  |---|---|---|---|---|---|---|---|---|
  | 1 | config_25 | 79.8 | 100 | 100 | 99 | 0.0 | 13 | 영상의학 보고서체 / 소견→근거→권고 |
  | 2 | config_34 | 79.5 | 100 | 99 | 99 | 0.0 | 13 | 영상의학 보고서체 / 소견→근거→권고 |
  | 3 | config_12 | 79.2 | 99 | 99 | 99 | 0.0 | 12 | 교육 해설체 / 소견→근거→권고 |
  | 4 | config_06 | 78.8 | 99 | 98 | 98 | 0.0 | 12 | 환자 설명체 / 소견→근거→권고 |
  | 5 | config_05 | 77.9 | 96 | 98 | 99 | 0.0 | 9 | 환자 설명체 / 소견→근거→권고 |
  | 6 | config_18 | 79.1 | 98 | 100 | 99 | 0.0 | 7 | 환자 설명체 / 체크리스트형 |
  | 7 | config_30 | 77.3 | 95 | 98 | 98 | 0.0 | 7 | 영상의학 보고서체 / 소견→근거→권고 |
  | 8 | config_09 | 76.4 | 95 | 95 | 97 | 0.0 | 7 | 교육 해설체 / 소견→근거→권고 |
  | 9 | config_16 | 77.4 | 96 | 96 | 99 | 0.0 | 6 | 간결 메모체 / 체크리스트형 |
  | 10 | config_28 | 79.4 | 99 | 99 | 100 | 0.0 | 5 | 환자 설명체 / 요약→상세 |

  > **구별성 축 주의**: 동일 10케이스에 대한 보고서들은 임베딩이 코사인 ≥0.85로 군집해 구별성 점수가
  > 전원 0이 되었다(spec §5 규칙대로). 즉 선발은 정확성·적합도·근거 + 쌍대결로 결정됐다.
  > 개선 여지(D7+): 케이스별 분산 임베딩 또는 스타일 전용 임베딩.
- **아레나 리더보드 스크린샷**: _TODO(라이브 앱 ④에서 캡처 — 위 표가 동일 데이터)_

---

## 실행

```bash
python -m venv .venv && .venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env   # GEMINI_API_KEY 입력 (보고서·아레나용)
.venv\Scripts\python.exe -m pytest tests/ -q
.venv\Scripts\python.exe -m streamlit run app.py
```

`.env` (또는 배포 시 `st.secrets`):
```
GEMINI_API_KEY=...
MAX_LLM_CALLS=700
DEMO_READONLY=false   # true면 Gemini·추론 버튼 잠금(공개 데모 보호)
```

---

## 안전·규제 설계

- 모든 화면 하단 **면책 고정**. 보고서 게이트가 진단 단정("확진"·"~병입니다" 등)을 차단하고 헤지 표현·근거 태그를 강제.
- **PHI 미영속화**: 비식별에서 지운 원본 환자명·ID(`old`)는 DB·디스크·화면 어디에도 저장/표시하지 않음. 원본 이미지도 미저장(비식별본만).
- 실환자 데이터 미사용 — pydicom 내장 샘플과 공개 데이터셋(MURA)만.

## D7 — "영상 아레나" (MURA 근골격 모델 선발, 실데이터 실행)

보고서 아레나(④)가 LLM 심사로 프롬프트 구성을 줄세우듯, **영상 아레나**는 학습된 영상 모델들을
**MURA 실제 의사 정답**으로 줄세워 1등을 `infer.py`에 채택한다. (RAG·temperature 미사용 — 순수 CNN)

- **데이터**: Stanford MURA(공개 근골격 X-ray). 로더가 실 구조(`study*_positive|negative`)를 파싱,
  라벨이 `train_labeled_studies.csv`와 **100% 일치**(XR_WRIST 9756장 검증).
- **후보 3종 학습** (XR_WRIST, ImageNet 사전학습 파인튜닝, 2-class 정상/비정상):

  | 순위 | 모델 | 정확도 | 민감도 | 특이도 |
  |---|---|---|---|---|
  | **1** | **densenet169** | **0.80** | 0.74 | 0.86 |
  | 2 | resnet50 | 0.745 | 0.82 | 0.67 |
  | 3 | densenet121 | 0.67 | 0.47 | 0.87 |

  (valid XR_WRIST 200장 실측, 의사 정답 대조. 1등 densenet169 채택 → 화면②가 흉부 폴백이 아니라
  근골격 MURA 모델로 추론.)

- **정직한 한계**: 위 수치는 **CPU 빠른검증**(1부위 XR_WRIST, 클래스당 120장, 2 epoch)이라 절대값이 낮다.
  **신호 확인용**이며, GPU로 전체 7부위·다epoch 풀학습 시 향상된다 — **동일 코드**(`scripts/train_mura.py`,
  `scripts/evaluate_mura.py`)로 데이터·epoch만 키우면 됨. 가중치 파일은 gitignore(`*.pt`).
- 픽셀 글자 블러 휴리스틱 → PaddleOCR 업그레이드는 선택 과제로 남김.
