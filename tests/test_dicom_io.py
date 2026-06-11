"""dicom_io 단위 테스트 — pydicom 내장 샘플(CT_small.dcm) 사용 (실환자 데이터 금지)."""
import numpy as np
from pydicom.data import get_testdata_file

from core import dicom_io


def test_load_sample_returns_metadata_and_pixels():
    path = get_testdata_file("CT_small.dcm")
    out = dicom_io.load(path)
    assert out["metadata"]["PatientName"] == "CompressedSamples^CT1"
    assert out["metadata"]["Modality"] == "CT"
    assert out["metadata"]["InstitutionName"] == "JFK IMAGING CENTER"
    assert isinstance(out["pixels"], np.ndarray)
    assert out["pixels"].shape == (128, 128)


def test_to_uint8_normalizes_to_full_range():
    path = get_testdata_file("CT_small.dcm")
    out = dicom_io.load(path)
    u8 = dicom_io.to_uint8(out["pixels"])
    assert u8.dtype == np.uint8
    assert u8.min() == 0 and u8.max() == 255
    assert u8.shape == (128, 128)


def test_to_uint8_flat_image_safe():
    flat = np.full((10, 10), 5, dtype=np.int16)
    u8 = dicom_io.to_uint8(flat)
    assert u8.dtype == np.uint8
    assert u8.max() == 0  # 분모 0 방지 — 빈 이미지 반환
