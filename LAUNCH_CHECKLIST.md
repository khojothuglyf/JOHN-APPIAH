# TradeWide - Launch Checklist

Manual steps to run before/at launch. No data is deleted and no admin
is created by any script in this repo.

## 1. Run the production role migration

- Open the [Supabase Dashboard](https://supabase.com/dashboard) -> your project -> **SQL Editor** -> New query.
- Paste the contents of `supabase/PRODUCTION_LAUNCH.sql` and click **Run**.
- Confirm the output notice: `PRODUCTION_LAUNCH complete: BUYER=..., SELLER=..., ADMIN=... No data deleted.`
- This renames existing `CUSTOMER` profiles to `BUYER`, re-enables the safe Buyer/Seller signup trigger, and removes any legacy auto-admin trigger. Safe to re-run.

## 2. Confirm RLS is enabled

- Dashboard -> **Authentication > Policies** (or Database > Tables).
- Confirm Row Level Security is **ENABLED** on:
  - `public.profiles` (users can read/update only their own row)
  - `public.categories` and `public.products` (read for all, write admin-only)
  - `public.cart_items` and `public.wishlist_items` (owner-only)
- If a table shows "RLS disabled", enable it and re-run the policy creation in `supabase/schema.sql`.

## 3. Configure custom SMTP for confirmation emails

- Dashboard -> **Authentication > Emails > SMTP Settings**.
- Set your custom SMTP provider (host, port, username, password, sender name/email) so confirmation links are not sent from Supabase's default sender.
- Make sure **Confirm email** is enabled under **Authentication > Providers > Email**, otherwise signup auto-activates accounts.

## 4. Test one Buyer and one Seller signup

- Deploy the app to Netlify (push to `main`).
- Visit the live site -> **Create Account**:
  1. Choose **Buyer** and register with a new email -> confirm the confirmation email arrives -> confirm -> sign in -> lands on the Buyer dashboard.
  2. Choose **Seller** and register with a second new email -> confirm the confirmation email -> sign in -> lands on the Seller dashboard.
- Confirm a `BUYER` and a `SELLER` row were created in `public.profiles`, and that neither account is `ADMIN`.
- Grant admin manually to your own account only if needed, using `supabase/promote-admin.sql` (never automatic).

## Notes

- `supabase/schema.sql` is the full schema (tables, policies, seed catalog) and is safe to re-run on existing projects.
- `supabase/PRODUCTION_LAUNCH.sql` is the launch-specific role migration only.
- Payment features are not part of this launch.
