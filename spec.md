# MedGate 구현 명세 (spec.md) — 단일 진실

> 이 문서는 구현 에이전트를 위한 **계약**이다. plan.md(사람용 기획)와 충돌하면 **spec.md가 이긴다**.
> 모호하면 **구현하지 말고 질문**한다. 명세에 없는 기능을 임의로 추가하지 않는다.

## 1. 제품 정의 (한 줄)

X-ray DICOM 파일을 업로드하면 → 개인정보를 비식별화하고 → AI가 정상/이상을 판정하고 → 품질 게이트를 통과한 보고서 초안을 만들어 → 보관함에서 조회하는 **Streamlit 단일 앱**. 4페이지째 "아레나"는 보고서 작성 프롬프트 50개를 경쟁시켜 1등을 운영에 채택한다.

## 2. 하드 제약 (위반 = 실패)

1. **Python 3.12 이상(3.13 허용) + Streamlit만.** FastAPI·Flask·Node·별도 프론트엔드 금지.
2. 외부 API는 **Gemini만** (`.env`의 `GEMINI_API_KEY`). 다른 유료 API 금지.
3. DB는 **SQLite 파일** (`data/medgate.db`). 외부 DB·서버 금지.
4. **이 폴더(C:\tool\medgate) 밖을 수정하지 않는다.** 단, 아래 폴더는 **읽기 전용 참고** 허용 (코드 패턴 이식 출처):
   - `C:\tool\plateguard\app\core.py` (블러/마스킹), `C:\tool\yolo11\preprocessor.py` (이미지 보정), `C:\tool\yolo11\db.py` (SQLite 패턴), `C:\tool\plateguard\scripts\_bench.py` (벤치마크)
5. 실환자 데이터 금지. 데이터는 **pydicom 내장 샘플**(`pydicom.data.get_testdata_file`)과 공개 데이터셋(MURA — 사용자가 직접 다운로드)만.
6. **Mock·가짜 결과 금지.** 실제 동작하는 코드만. 모델이 없으면 "모델 없음" 상태를 정직하게 표시한다.
7. 모든 화면 하단에 면책 고정: **"본 서비스는 교육·기술 데모입니다. 의료 진단이 아니며, 모든 의료적 판단은 의사와 상담하세요."**
8. `core/` 모듈은 **streamlit을 import하지 않는다** (순수 파이썬 — pytest로 단독 테스트 가능해야 함).

## 3. 폴더 구조 (고정 — 변경 시 질문 먼저)

```
medgate/
├── app.py                  # Streamlit 진입점 (4페이지). 화면 코드만, 로직 금지
├── core/
│   ├── dicom_io.py         # DICOM 읽기: pydicom → 메타데이터 dict + 픽셀 numpy 배열
│   ├── deid.py             # 비식별화: 식별 태그 제거/치환 + 픽셀 내 글자영역 블러
│   ├── preprocess.py       # X-ray 보정: CLAHE·감마·정규화 (yolo11 패턴 이식)
│   ├── infer.py            # AI 판정 — 인터페이스 고정: predict(img: np.ndarray) -> {"label": str, "confidence": float}
│   ├── report.py           # 보고서 초안(Gemini) + 품질 게이트(금지어·필수표현·재시도≤3)
│   ├── store.py            # SQLite 저장·조회 (studies, analyses, arena_runs 테이블)
│   └── arena.py            # 4페이지용: 프롬프트 구성 50개 생성→채점→해고→1등 채택
├── scripts/
│   ├── prep_data.py        # pydicom 샘플 준비 + (있으면) MURA 정리
│   └── bench.py            # 처리 시간 실측 (단계별 ms)
├── tests/                  # pytest. 각 core 모듈당 테스트 파일 1개 이상
├── data/                   # benchmark_cases.json, cache/, medgate.db (db·cache는 gitignore)
├── requirements.txt
├── .env.example
├── CLAUDE.md / spec.md / plan.md
```

## 3.5 이식 지도 — 다른 프로젝트에서 가져올 코드 (구현 전 필독)

아래 출처 파일을 **먼저 읽고**, 코드를 medgate 안으로 **복사해와 다듬어** 쓴다. 출처 폴더는 절대 수정하지 않는다.

| 출처 파일 (읽기 전용) | 가져올 것 | 넣을 곳 | 방법 |
|---|---|---|---|
| `C:\tool\plateguard\app\core.py` | 박스 검출→블러(mosaic) 처리 흐름 | `core/deid.py` | 함수 복사 후 수정 — 가리는 대상을 번호판이 아니라 "픽셀에 박힌 글자 영역"으로 |
| `C:\tool\yolo11\preprocessor.py` | CLAHE·감마·정규화 함수 | `core/preprocess.py` | 필요한 함수만 발췌 복사 (CLAHE는 X-ray 보정 표준 기법) |
| `C:\tool\yolo11\db.py` | SQLite 캡슐화 클래스 패턴 | `core/store.py` | 패턴만 모방, 스키마는 spec §3대로 새로 |
| `C:\tool\yolo11\tests\` + `test_ocr_accuracy.py` | 스모크+회귀 테스트 구조, 실패 시 exit 1 게이팅 | `tests/` | 구조만 모방 |
| `C:\tool\plateguard\scripts\_bench.py` | 단계별 처리시간 실측 방식 | `scripts/bench.py` | 패턴 모방 |

**이식 규칙:**
1. **모델 가중치 복사 절대 금지**: `best.pt`(번호판 검출), `plate_ocr_crnn.pth`(번호판 글자) — 번호판용으로 학습된 모델이라 X-ray에 무용하다. X-ray 판정 모델은 spec §7 D2에서 별도 결정.
2. 픽셀 내 글자 검출 — **v1은 경량 CV 휴리스틱 허용** (D1에서 감리 승인됨: 밝기+가로라인 기반, 배포 용량 때문에 PaddleOCR 대신). 단 **화면①에 한계 1줄 명시 의무**: "픽셀 글자 블러는 밝기 기반 휴리스틱 — 폰트·대비에 따라 미검출 가능". PaddleOCR 업그레이드는 D7 선택 과제.
3. 출처 프로젝트를 import 하거나 `sys.path`에 추가하지 않는다 — 코드를 가져와 medgate 안에서 독립시킨다.
4. 가져온 코드 상단에 출처 주석 1줄: `# 이식: plateguard app/core.py 의 mosaic() 패턴`

## 4. 화면별 명세 + 완료 기준(AC)

### ① 업로드
- `st.file_uploader`(.dcm, 다중) → `dicom_io.load` → `deid.run` → 좌(원본)/우(비식별) `st.image` 비교 + "제거된 태그" 표 → `store`에 기록.
- **AC**: pydicom 샘플 업로드 시 비교 이미지·태그 표가 보이고, `data/medgate.db`에 행이 생긴다. 비식별본에서 PatientName 등 식별 태그가 실제로 제거됐음을 테스트로 증명.

### ② 분석
- 보관함에서 항목 선택 → [분석 시작] → `st.status`로 단계 표시(전처리→추론→저장) → 결과 카드: 라벨("이상 소견 의심"/"정상 범위")·확신도 %·처리 시간 ms.
- **AC**: 동일 항목 재분석 시 저장된 결과를 즉시 표시(중복 추론 안 함). 처리 시간이 실측값이다.

### ③ 보관함
- `st.dataframe` 목록(비식별ID·일시·부위·상태·판정) → 선택 시 상세 + [보고서 초안 생성] → 게이트 **통과본만** 표시, 게이트 리포트(위반·재시도 이력) 함께 표시.
- **AC**: 금지어가 포함된 초안은 화면에 노출되지 않고, 재시도 로그가 보인다.

### ④ 아레나
- [아레나 실행] → `arena.py`가 **보고서 작성 프롬프트 구성 50개**를 6차원으로 생성 → `data/benchmark_cases.json`(10케이스)로 채점 → 리더보드(`st.dataframe`): 생존 10 / 해고 40 + 해고 사유 → [1등 채택] → 1등 구성이 ③의 운영 프롬프트로 저장됨.
- **AC**: 실행 후 `data/arena_leaderboard.json` 생성. 1등 채택 시 이후 보고서 초안이 그 구성으로 생성된다. 같은 입력 재실행 시 캐시 사용(LLM 재호출 없음).

## 5. 아레나 규칙 (숫자 계약 — 임의 변경 금지)

- **6차원**: 역할 스타일(영상의학 보고서체/임상 요약체/환자 설명체…) · 신중도 · 어조 · 구조(소견→근거→권고 등) · 근거 표기 빈도 · 용어 난이도
- **하드 게이트 (즉시 해고)**: ⓐ 진단 단정·면책 누락 1회 ⓑ JSON 출력 구조 위반 ≥20% ⓒ 근거 표기 누락 ≥30%
- **채점 4축**: 정확성 35% · 케이스 적합도 25% · 근거 품질 20% · 구별성 20% (응답 임베딩 평균 코사인 유사도 ≥0.85 → 구별성 0점)
- **생존**: 합성 70점 미만 탈락 → 70 이상 중 상위 15개만 쌍대결(케이스 3개 샘플) → 최종 1~10위 생존, 40개 해고
- **temperature**: 채점·심사 0 / 후보 생성 0.7
- **비용 가드**: 1회 실행 LLM 호출 상한 = `.env`의 `MAX_LLM_CALLS`(기본 700). 초과 시 중단하고 보고. (페르소나×케이스) 응답은 `data/cache/`에 캐시.

## 6. 보고서 게이트 규칙

- **금지어(부분 일치)**: "확진", "진단됩니다", "~병입니다", "치료하세요", "복용", "수술이 필요"
- **필수**: 모든 소견 문장에 "의심/가능성/확인 필요" 계열 표현 + 근거 태그 `[AI결과]`/`[일반소견]`/`[불확실]` 중 하나
- 출력 JSON: `{"draft": str, "evidence_tags": [...], "gate": {"passed": bool, "violations": [...], "retries": int}}` — 3회 재시도 후에도 실패면 실패로 기록(가짜 통과 금지)

## 7. 단계별 진행 (한 번에 한 단계 — 완료 후 멈추고 보고)

| 단계 | 구현 | 완료 기준 |
|---|---|---|
| **D1** | `dicom_io.py` → `deid.py` → 화면① | `pytest tests/ -q` 통과 + 샘플 업로드 화면 동작 (①AC 전부) |
| **D2** | `preprocess.py` → `infer.py`(베이스라인 모델 — 선택지를 제시하고 **사용자 승인 후** 결정) → 화면② | ②AC + bench로 단계별 ms 실측 |
| **D3** | `store.py` 확장 → 화면③ 목록/상세 | ③ 목록·상세 동작 |
| **D4** | `report.py` + 게이트 + 테스트 보강 | ③AC (게이트 차단·재시도 로그) + 게이트 단위테스트 |
| **D5** | README(스크린샷·실측 수치·"번호판→X-ray 개조" 스토리) + 배포 준비 | `streamlit run app.py` 클린 실행, README 완성 |
| **D6** | `arena.py` + `benchmark_cases.json`(첫 작업) + 화면④ | ④AC 전부 |
| **D7** (예약) | `infer.py` 모델을 MURA DenseNet169 파인튜닝(근골격 정상/이상)으로 교체 — D2의 TorchXRayVision(흉부) 베이스라인 대체 | MURA 학습 가중치로 근골격 X-ray 판정, 화면② 도메인 한계 문구 제거 |

## 8. 작업 규칙 (하네스 — 매 응답에 적용)

1. **검증 없는 "됐다" 금지.** 파일을 만들었으면 실행하거나 테스트를 돌리고, **실제 출력 로그 원문**을 보여준다. 이게 이 프로젝트의 1번 규칙이다.
2. **한 번에 한 단계.** 단계 완료 시: 변경 파일 목록 + 테스트/실행 로그 + 다음 단계 안내 후 **멈춘다**. 다음 단계는 사용자가 지시한다.
3. 코드를 채팅에서 설명할 때는 줄ID 표기(`d4:` = dicom_io.py 4번 줄)로 짚는다.
4. 새 패키지는 `requirements.txt`에 추가하고 이유를 1줄 적는다.
5. 단계마다 git 커밋 1개, 한국어 메시지 (`feat: D1 — DICOM 읽기·비식별화·업로드 화면`).
6. 모르는 것·모호한 것은 추측 말고 질문. 없는 파일·심볼을 가정하지 않는다 (먼저 읽는다).
