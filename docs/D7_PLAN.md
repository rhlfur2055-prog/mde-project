# D7 실행 계획 — MURA 근골격 모델로 infer 교체 (아침에 사람이 실행)

> 현재 `infer.py` 베이스라인은 **흉부 학습(TorchXRayVision)** 이라 근골격 X-ray엔 도메인 외다.
> D7은 **MURA(스탠포드 근골격 X-ray)** 로 DenseNet을 파인튜닝해 교체한다.
> 코드는 "데이터만 꽂으면 도는 상태"로 이미 준비됨(아래 스크립트). **다운로드·실학습은 사람이 직접.**

## 준비된 코드 (밤새 작성·더미 스모크 검증 완료)
- `core/mura_dataset.py` — MURA 폴더 로더 (positive/negative 마커 라벨 + ImageFolder 폴백)
- `scripts/train_mura.py` — DenseNet 파인튜닝(정상/비정상 2-class)
- `scripts/evaluate_mura.py` — 영상 아레나: 여러 모델을 정답으로 채점→리더보드
- `core/infer.py` — `MURA_MODEL`(.pt) 있으면 자동으로 MURA 추론, 없으면 흉부 폴백 (predict 인터페이스 불변)

---

## 체크리스트 (순서대로)

### 1. MURA 데이터 신청·다운로드
- [ ] 신청: https://stanfordmlgroup.github.io/competitions/mura/ (이메일 등록 → 다운로드 링크 수신, **연구용 라이선스** 동의)
- [ ] 다운로드 후 압축해제 → 예상 구조:
  ```
  MURA-v1.1/
  ├── train/XR_{부위}/patient#####/study#_{positive|negative}/image#.png
  ├── valid/XR_{부위}/patient#####/study#_{positive|negative}/image#.png
  ├── train_labeled_studies.csv   # study 경로 → 라벨(0/1)
  └── valid_labeled_studies.csv
  ```
- [ ] **라벨 교차검증(중요)**: `core/mura_dataset.py`는 현재 폴더명 `positive/negative` 규칙으로 라벨링한다.
      실제 배포 구조를 확인하고, `*_labeled_studies.csv`와 다르면 `mura_dataset.py`의 `label_from_path`/
      `MuraDataset`를 CSV 우선으로 보정한다 (코드에 `# TODO(데이터 확인)` 표시됨).

### 2. 학습 (여러 설정 → 여러 모델 .pt)
- [ ] GPU 권장. 여러 구성으로 학습해 후보 모델들을 만든다:
  ```bash
  python -m scripts.train_mura --data MURA-v1.1/train --arch densenet169 --pretrained \
      --epochs 3 --out data/mura_models/d169.pt
  python -m scripts.train_mura --data MURA-v1.1/train --arch densenet121 --pretrained \
      --epochs 3 --out data/mura_models/d121.pt
  # (lr·epochs·arch 등을 바꿔 여러 후보 생성)
  ```

### 3. 영상 아레나 평가 (실제 정답으로 줄세우기)
- [ ] valid셋(의사 정답)으로 후보 모델들을 채점 → 정확도순 리더보드:
  ```bash
  python -m scripts.evaluate_mura --models data/mura_models --data MURA-v1.1/valid --arch densenet169
  ```
  - 정확도·민감도(비정상 검출)·특이도(정상 검출) 출력. **arch가 섞였으면 arch별로 따로 평가**(현재 한 번에 한 arch).
- [ ] 1등 모델 선정.

### 4. infer.py에 1등 채택
- [ ] 1등 `.pt`를 운영 경로로 지정 (둘 중 하나):
  ```bash
  copy data\mura_models\<1등>.pt data\mura_model.pt   # 기본 경로
  # 또는 .env / st.secrets: MURA_MODEL=data/mura_models/<1등>.pt
  ```
  - `infer.predict()`는 `MURA_MODEL`이 있으면 **자동으로** 근골격 모델을 쓴다(코드 변경 불필요).
  - `infer.py`의 `MURA_ARCH`가 1등 모델 arch와 일치하는지 확인(기본 `densenet169`).

### 5. 화면② "도메인 외" 한계 문구 제거 (MURA 채택 후)
- [ ] `app.py` `page_analyze()` 의 `st.warning("현재 흉부 학습 모델(TorchXRayVision)로 파이프라인 검증 중 — 근골격 모델(MURA 파인튜닝, D7)로 교체 예정.")` → **제거 또는 "근골격 MURA 모델 적용됨"으로 교체**.
- [ ] `app.py` `_render_card()` 의 캡션 `"최다 활성 소견(흉부 모델): ..."` → 근골격 표현으로 갱신.
- [ ] `README.md` 의 D7 로드맵 항목 / 화면② 설명에서 "흉부 학습·도메인 외" 문구 정리.
- [ ] `spec.md §7` D7 행을 완료 처리.

---

## "영상 아레나"란 (보고서 아레나의 영상 버전)
화면④ 아레나가 **보고서 작성 프롬프트 구성**을 LLM 심사로 줄세웠듯,
영상 아레나는 **학습된 영상 모델들**을 **MURA 실제 정답**으로 줄세운다:

```
여러 설정으로 train_mura.py 학습 → evaluate_mura.py로 valid셋 정답 채점(정확도·민감도·특이도)
→ 1등 모델을 infer.py에 채택
```
- 보고서 아레나(LLM-as-judge, 주관적 루브릭) vs 영상 아레나(객관적 정답 라벨) — 두 평가 축을 모두 갖춘 포트폴리오.

## 주의
- ★ 데이터 다운로드·실학습·평가는 **사람이 직접**. 무인 자동 실행 금지(라이선스·연산 비용).
- 학습엔 GPU 권장(`--device cuda`). 가중치 파일은 gitignore(`*.pt`)됨 — 커밋 금지.
