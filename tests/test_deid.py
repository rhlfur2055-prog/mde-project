"""deid 단위 테스트 — 식별 태그 제거/치환 + 픽셀 글자영역 블러를 실제로 증명한다."""
import cv2
import numpy as np
from pydicom.data import get_testdata_file

from core import deid, dicom_io


def test_identifying_tags_removed_or_replaced():
    """①AC: 비식별본에서 PatientName 등 식별 태그가 실제로 제거/치환됨을 증명."""
    loaded = dicom_io.load(get_testdata_file("CT_small.dcm"))
    orig_name = str(loaded["dataset"].PatientName)
    orig_inst = str(loaded["dataset"].InstitutionName)
    assert orig_name == "CompressedSamples^CT1"
    assert orig_inst == "JFK IMAGING CENTER"

    res = deid.run(loaded)
    ds = res["dataset"]

    # PatientName / PatientID 는 가명으로 치환
    assert str(ds.PatientName) != orig_name
    assert str(ds.PatientName).startswith("ANON-")
    assert str(ds.PatientID).startswith("ANON-")
    # InstitutionName 은 제거(blank)
    assert str(ds.InstitutionName) == ""

    # 원본 Dataset 은 보존(부작용 없음)
    assert str(loaded["dataset"].PatientName) == orig_name
    assert str(loaded["dataset"].InstitutionName) == orig_inst

    kws = {r["keyword"] for r in res["removed_tags"]}
    assert {"PatientName", "PatientID", "InstitutionName"} <= kws


def test_pseudonym_is_deterministic():
    a = deid._pseudonym("1CT1|CompressedSamples^CT1")
    b = deid._pseudonym("1CT1|CompressedSamples^CT1")
    assert a == b and a.startswith("ANON-")


def test_text_region_blur_on_synthetic_image():
    """합성 이미지에 그린 글자가 검출되고, 블러 후 글자 경계(분산)가 감소함을 증명."""
    img = np.full((200, 400), 20, dtype=np.uint8)  # 어두운 배경
    cv2.putText(img, "PATIENT JOHN DOE", (20, 110),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, 255, 2)

    boxes = deid.detect_text_regions(img)
    assert len(boxes) >= 1

    blurred = deid.blur_regions(img, boxes)
    x1, y1, x2, y2 = boxes[0]
    var_before = img[y1:y2, x1:x2].var()
    var_after = blurred[y1:y2, x1:x2].var()
    assert var_after < var_before  # 글자 경계가 뭉개짐
    # 블러는 사본 — 원본 미변경
    assert np.array_equal(img, np.full((200, 400), 20, dtype=np.uint8)) is False  # 글자는 있음
    assert not np.array_equal(img, blurred)


def test_clean_sample_has_no_false_text_detection():
    """깨끗한 CT 샘플(burned-in 텍스트 없음)에는 과검출이 없어야 한다 (해부학 오블러 방지)."""
    loaded = dicom_io.load(get_testdata_file("CT_small.dcm"))
    u8 = dicom_io.to_uint8(loaded["pixels"])
    boxes = deid.detect_text_regions(u8)
    assert boxes == []
