alter table public.pico_ai_events add column background_id text not null default 'diriyah-arch'
  check (background_id in ('diriyah-arch','emerald-studio','alula-alcove','jeddah-roshan','hegra'));
-- Historical sessions retain their original selection; new sessions snapshot the event background.
alter table public.pico_ai_sessions add column background_id text not null default 'hegra'
  check (background_id in ('diriyah-arch','emerald-studio','alula-alcove','jeddah-roshan','hegra'));
