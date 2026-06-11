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
- **아레나 풀런** (구성 50 × 케이스 10): 생존/해고·LLM 호출수 — _TODO: 풀런 로그 삽입_
- **아레나 리더보드 스크린샷**: _TODO_

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

## 로드맵 (D7)

- `infer.py` 베이스라인을 **MURA DenseNet169 파인튜닝**(근골격 정상/이상)으로 교체 — 현재 흉부 학습(TorchXRayVision)은 파이프라인 검증용이며 근골격은 도메인 외.
- 픽셀 글자 블러 휴리스틱 → PaddleOCR 업그레이드(선택).
