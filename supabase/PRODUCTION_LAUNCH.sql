/* ============================================================
   TRADEWIDE - PRODUCTION ROLE MIGRATION (run once in the SQL Editor)
   ============================================================
   Purpose
   -------
   Safe, idempotent migration that aligns production roles with the
   Buyer/Seller frontend while the launch checklist is completed.

   What it does
   ------------
   1. Renames existing CUSTOMER profiles to BUYER (keeps all data).
   2. Retains / re-enables the safe Buyer/Seller signup trigger.
   3. Removes any legacy auto-admin trigger (ADMIN is never created
      automatically; it is granted only by supabase/promote-admin.sql).
   4. Deletes NO user data. Only the role value changes on CUSTOMER rows.

   Safe to run more than once: every statement is guarded with
   IF EXISTS / DO NOTHING / OR REPLACE.
   ============================================================ */

-- ---------- 1. Rename existing CUSTOMER profiles to BUYER ----------
-- Idempotent: no-op when there are no CUSTOMER rows left. Does not
-- touch BUYER/SELLER/ADMIN rows and never deletes any rows.
update public.profiles
   set role = 'BUYER',
       updated_at = now()
 where role = 'CUSTOMER';

-- Keep the role check constraint correct under an explicit, idempotent
-- name so the rename cannot be re-introduced and re-running stays safe.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('BUYER', 'SELLER', 'ADMIN'));

-- ---------- 2. Safe Buyer/Seller signup trigger ----------
-- Only the literal value 'seller' (case-insensitive) may create a
-- SELLER profile. Every other value - including 'admin', typos or no
-- value at all - resolves to the default BUYER role. Existing profiles
-- are never overwritten (ON CONFLICT DO NOTHING).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_requested text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'requested_role', '')));
  v_role text;
begin
  v_role := case
    when v_requested = 'seller' then 'SELLER'
    else 'BUYER'
  end;

  insert into public.profiles (id, first_name, last_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    v_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 3. Never automatically create an ADMIN ----------
-- Removes the legacy "first user becomes admin" trigger/function on
-- projects that ran an earlier schema, so an admin is only ever
-- granted deliberately via supabase/promote-admin.sql.
drop trigger if exists on_profile_first_admin on public.profiles;
drop function if exists public.assign_first_user_admin();

-- ---------- 4. Summary (no data is deleted) ----------
do $$
declare
  v_buyers  int;
  v_sellers int;
  v_admins  int;
begin
  select count(*) into v_buyers  from public.profiles where role = 'BUYER';
  select count(*) into v_sellers from public.profiles where role = 'SELLER';
  select count(*) into v_admins  from public.profiles where role = 'ADMIN';

  raise notice 'PRODUCTION_LAUNCH complete: BUYER=%, SELLER=%, ADMIN=%. No data deleted.', v_buyers, v_sellers, v_admins;
end;
$$;
