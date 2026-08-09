/* ============================================================
   PROMOTE ONE ACCOUNT TO ADMIN (run manually, in the SQL Editor)
   ============================================================
   Target account: khojothuglyf1@gmail.com

   How to run
   ----------
   1. Make sure the account already exists: sign up / sign in once with
      khojothuglyf1@gmail.com so a row exists in auth.users (the
      handle_new_user trigger creates the matching public.profiles row).
   2. Supabase Dashboard -> SQL Editor -> New query.
   3. Paste this whole file and click "Run".

   What it does
   ------------
   - Looks up the target user by email in auth.users.
   - Updates ONLY that profile row to role = 'ADMIN'.
   - Safe to run more than once (re-running just re-applies the same
     update). It never promotes any other account.
   ============================================================ */

do $$
declare
  v_target_email text := 'khojothuglyf1@gmail.com';
  v_target_id uuid;
begin
  select id into v_target_id
  from auth.users
  where lower(email) = lower(v_target_email);

  if v_target_id is null then
    raise exception 'No auth user found for email %. Create/sign in with the account first, then re-run.', v_target_email;
  end if;

  update public.profiles
     set role       = 'ADMIN',
         updated_at = now()
   where id = v_target_id;

  if not found then
    raise notice 'No profile row for % yet; it is created automatically on the next sign-in. Re-run this script afterwards.', v_target_email;
  else
    raise notice 'Promoted % to ADMIN.', v_target_email;
  end if;
end;
$$;
