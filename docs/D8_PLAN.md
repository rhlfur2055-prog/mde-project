# D8 실행 계획 — PACS 네트워크 연동 (아침에 사람이 실행)

> 화면① "파일 업로드" 대신, 실제 병원처럼 **PACS에서 DICOM을 네트워크로 수신(C-STORE)** 해
> 같은 파이프라인(비식별→판정→저장)에 넣는다. 코드 골격은 준비됨. **실제 전송·Orthanc 설치는 사람이 직접.**

## 준비된 코드 (밤새 작성·기동 스모크 검증 완료)
- `scripts/pacs_scp.py` — pynetdicom **C-STORE SCP(수신 서버)** 골격.
  수신 DICOM → `dicom_io.load` → `deid.run` → `store.add_study`(status=`received(PACS)`).
  pynetdicom 미설치 시 정직하게 안내 후 종료.
- `requirements.txt` — `pynetdicom==3.0.4` 추가.

검증(밤): 서버가 에러 없이 기동·종료(`test_pacs_scp.py` 2 passed). **실제 C-STORE 전송은 미수행.**

---

## 체크리스트 (순서대로)

### 1. 수신 서버 기동 (MedGate 쪽)
```bash
python -m scripts.pacs_scp --port 11112 --aet MEDGATE
# 출력: [PACS] C-STORE SCP 기동: AET=MEDGATE port=11112
```

### 2. Orthanc(오픈소스 PACS) 설치·기동 (송신 쪽 시뮬레이션)
- [ ] 설치: https://www.orthanc-server.com/download.php (Windows 인스톨러) 또는 Docker:
  ```bash
  docker run -p 4242:4242 -p 8042:8042 jodogne/orthanc
  ```
  - 4242 = DICOM 포트, 8042 = 웹 UI.
- [ ] Orthanc 웹 UI(http://localhost:8042)에 pydicom 샘플/공개 DICOM 업로드.

### 3. Orthanc → MedGate 수신 서버로 C-STORE 전송 시연
- [ ] dcmtk `storescu` 또는 pynetdicom `python -m pynetdicom storescu`:
  ```bash
  # dcmtk
  storescu -aec MEDGATE 127.0.0.1 11112 path\to\image.dcm
  # 또는 pynetdicom 내장 앱
  python -m pynetdicom storescu 127.0.0.1 11112 path\to\image.dcm -aec MEDGATE
  ```
- [ ] MedGate 서버 로그에 `[PACS] 수신·비식별·저장 완료 ...` 출력 확인.
- [ ] 화면③ 보관함에 `source=PACS:...`, status `received(PACS)` 항목이 생겼는지 확인.

### 4. (옵션) 수신 시 자동 추론 연계
- [ ] `scripts/pacs_scp.py` `handle_store`의 `# TODO(D8): infer.predict ...` 위치에 추론 연계.
      추론은 무거우니 **수신=비식별·저장만, 추론은 화면②/큐로 분리** 권장.

### 5. README에 "업로드 vs PACS 수신" 차이 추가
- [ ] `README.md` 4페이지 설명/아키텍처에 한 줄: **"입력 경로: ① 파일 업로드 또는 PACS C-STORE 네트워크 수신(D8) — 이후 처리 동일."**
  - 추가 위치 후보: README "## 4페이지 구성" 또는 "## 아키텍처" 섹션.

---

## 부록 — 검증된 명령 모음 (밤샘 작업 중 확인)

### A. storescu 직접 전송 (Orthanc 불필요 — 이미 실증 완료)
```bash
# 터미널1: medgate 수신 서버
python -m scripts.pacs_scp --port 11112
# 터미널2: pydicom 샘플을 medgate로 C-STORE 전송 (실제 전송 성공 로그 확인됨)
SAMPLE=$(python -c "from pydicom.data import get_testdata_file; print(get_testdata_file('CT_small.dcm'))")
python -m pynetdicom storescu 127.0.0.1 11112 "$SAMPLE" -aec MEDGATE
```

### B. Orthanc(가짜 병원 PACS) → medgate 푸시 (Docker Desktop 실행 필요)
> 밤샘 작업 시 **Docker CLI는 설치(v29.2.0)됐으나 Docker Desktop 데몬이 미실행**이라 미수행.
> Docker Desktop을 켠 뒤 아래를 실행하면 됨(명령은 env-config로 정리해둠 — orthancteam/orthanc).
```bash
# 1) Orthanc 기동: medgate를 modality로 등록(컨테이너→호스트는 host.docker.internal)
docker run -d --name medgate-orthanc -p 8042:8042 -p 4242:4242 \
  -e 'ORTHANC__DICOM_MODALITIES={"medgate":["MEDGATE","host.docker.internal",11112]}' \
  -e ORTHANC__AUTHENTICATION_ENABLED=false -e ORTHANC__REMOTE_ACCESS_ALLOWED=true \
  orthancteam/orthanc
# 2) 호스트에 medgate 수신 서버 기동
python -m scripts.pacs_scp --port 11112
# 3) 샘플을 Orthanc에 업로드 → 인스턴스 ID 획득
SAMPLE=$(python -c "from pydicom.data import get_testdata_file; print(get_testdata_file('CT_small.dcm'))")
ID=$(curl -s -X POST http://localhost:8042/instances --data-binary @"$SAMPLE" | python -c "import sys,json;print(json.load(sys.stdin)['ID'])")
# 4) Orthanc → medgate 로 C-STORE 푸시
curl -s -X POST http://localhost:8042/modalities/medgate/store -d "$ID"
# 5) medgate 서버 로그에 [PACS] 수신·비식별·추론·저장 확인 → 화면③에 received(PACS) 항목
# 정리: docker rm -f medgate-orthanc
```

## 주의
- ★ Orthanc 설치·실제 C-STORE 전송·방화벽/포트 개방은 **사람이 직접**. 무인 자동 실행 금지.
- Docker Desktop **데몬 기동**도 시스템 동작이라 무인 실행하지 않음(사람이 켠다).
- 수신 DICOM도 실환자 데이터 금지 — pydicom 샘플/공개 데이터만.
- 운영 노출 시 DICOM 포트(11112)는 신뢰 네트워크/AET 화이트리스트로 제한.
