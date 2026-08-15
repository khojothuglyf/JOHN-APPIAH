/* Phase 1 delivery requests. Safe to run more than once. Delivery is
   arranged directly by the seller and buyer; TradeWide does not provide
   riders, fees, tracking, or fulfilment. */

create table if not exists public.delivery_requests (
  id bigserial primary key,
  order_id text not null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  recipient_name text not null check (char_length(btrim(recipient_name)) between 1 and 160),
  recipient_phone text not null check (char_length(btrim(recipient_phone)) between 3 and 50),
  delivery_area text not null check (char_length(btrim(delivery_area)) between 1 and 160),
  delivery_instructions text not null check (char_length(btrim(delivery_instructions)) between 1 and 2000),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'DELIVERY_CONFIRMED', 'READY_FOR_DELIVERY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_id)
);

create index if not exists delivery_requests_buyer_id_idx on public.delivery_requests (buyer_id, created_at desc);
create index if not exists delivery_requests_seller_id_idx on public.delivery_requests (seller_id, created_at desc);
create index if not exists delivery_requests_order_id_idx on public.delivery_requests (order_id);

alter table public.delivery_requests enable row level security;

drop trigger if exists delivery_requests_set_updated_at on public.delivery_requests;
create trigger delivery_requests_set_updated_at
  before update on public.delivery_requests
  for each row execute procedure public.set_updated_at();

/* A request is visible only to its buyer, assigned seller, or an admin.
   The seller can change only the delivery-state fields; recipient details
   and ownership cannot be changed through the browser. The WITH CHECK
   below locks every non-status column to its existing value, so a seller
   can never rewrite recipient PII, reassign the request to another buyer,
   or point it at a different order. */
drop policy if exists delivery_requests_select_participants on public.delivery_requests;
create policy delivery_requests_select_participants on public.delivery_requests
  for select using (
    auth.uid() = buyer_id or auth.uid() = seller_id or public.is_admin()
  );

drop policy if exists delivery_requests_buyer_insert on public.delivery_requests;
create policy delivery_requests_buyer_insert on public.delivery_requests
  for insert with check (
    auth.uid() = buyer_id and auth.uid() <> seller_id
  );

drop policy if exists delivery_requests_seller_update_status on public.delivery_requests;
create policy delivery_requests_seller_update_status on public.delivery_requests
  for update using (auth.uid() = seller_id or public.is_admin())
  with check (
    (public.is_admin()) or
    (
      auth.uid() = seller_id
      and status in ('DELIVERY_CONFIRMED', 'READY_FOR_DELIVERY')
      and exists (
        select 1 from public.delivery_requests prev
        where prev.id = delivery_requests.id
          and prev.order_id = delivery_requests.order_id
          and prev.buyer_id = delivery_requests.buyer_id
          and prev.seller_id = delivery_requests.seller_id
          and prev.recipient_name = delivery_requests.recipient_name
          and prev.recipient_phone = delivery_requests.recipient_phone
          and prev.delivery_area = delivery_requests.delivery_area
          and prev.delivery_instructions = delivery_requests.delivery_instructions
      )
    )
  );
