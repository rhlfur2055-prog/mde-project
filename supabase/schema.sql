-- posera — P4 스키마 (Supabase SQL Editor에 붙여넣고 RUN)
-- 로그인 없는 단계: 기기ID(device_id)로 스캔을 저장한다.
-- ⚠️ DEV ONLY 정책: anon(공개키) 전체 허용. 로그인(P4b) 붙일 때
--    device_id → auth.uid() 기반 RLS로 교체해 사용자별로 격리한다.

create table if not exists public.scans (
  id               uuid primary key default gen_random_uuid(),
  device_id        text not null,
  taken_at         timestamptz not null default now(),
  overall_score    int,
  overall_grade    text,
  symmetry_score   int,
  golden_score     int,
  lower_upper_ratio real,
  shoulder_tilt_deg real,
  hip_tilt_deg     real,
  head_tilt_deg    real,
  metrics          jsonb,   -- 전체 BodyMetrics (score.ts 산출물)
  landmarks        jsonb    -- 33 자세 랜드마크 (P6 재학습용 — 실데이터)
);

create index if not exists idx_scans_device_time
  on public.scans (device_id, taken_at desc);

-- RLS 켜고, 개발용 anon 정책 + 명시적 grant(자동노출 off여도 접근되게)
alter table public.scans enable row level security;

drop policy if exists scans_dev_insert on public.scans;
drop policy if exists scans_dev_select on public.scans;

create policy scans_dev_insert on public.scans
  for insert to anon with check (true);
create policy scans_dev_select on public.scans
  for select to anon using (true);

grant select, insert on public.scans to anon;
