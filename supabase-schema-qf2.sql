-- ============================================================
-- Qudsunfable 2 — Supabase schema (ตามสเปก design handoff)
-- multi-tenant + RLS + ทุกการเงินเป็น transaction
-- เงินเก็บเป็นสตางค์ (bigint) · กก. เป็น numeric
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- ตาราง ----------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sub text default '',
  owner_name text default '',
  phone1 text default '', phone2 text default '',
  bank text default '', bank_no text default '', line_id text default '',
  plan text default 'basic' check (plan in ('basic','pro','multi')),
  status text default 'active',
  invite_code text unique default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id),
  name text not null,
  role text not null default 'staff' check (role in ('owner','staff')),
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists settings (
  tenant_id uuid primary key references tenants(id),
  pin_hash text,
  pin_on_pay boolean default true,
  pin_on_delete boolean default true,
  pin_on_rate boolean default false,
  base_day_satang bigint default 30000,   -- ค่าแรงฐาน/วัน 300 บาท
  com_kg_satang bigint default 50,        -- คอม 0.50 บาท/กก.
  updated_at timestamptz default now()
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  code text not null,                     -- A1 โอน / A2 สด / B1 รับขาย / C1 ค่าใช้จ่าย
  name text not null,
  color text default '#3B82D9',
  icon text default 'wallet',
  balance_satang bigint not null default 0,
  sort int default 0,
  unique (tenant_id, code)
);

create table if not exists customers (               -- ลูกค้า/สวน (ฝั่งรับซื้อ)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, phone text default '',
  bank text default '', bank_no text default '',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists buyers (                  -- ล้ง/ตลาด (ฝั่งขาย)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, phone text default '',
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists grades (                  -- เกรด + ราคาตั้งต้น (เพิ่ม/แก้ได้)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  color text default '#E8692E',
  buy_satang bigint default 0,            -- ราคารับซื้อ/กก.
  sell_satang bigint default 0,           -- ราคาขาย/กก.
  sort int default 0,
  active boolean default true,
  unique (tenant_id, name)
);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  no int not null,
  code text not null,                     -- ซ-001 / ข-001
  type text not null check (type in ('buy','sell')),
  customer_id uuid references customers(id),
  buyer_id uuid references buyers(id),
  total_kg numeric not null default 0,
  total_satang bigint not null default 0,
  status text not null default 'due' check (status in ('due','paid','canceled')),
  note text default '',
  slip_url text default '',
  created_by uuid references profiles(user_id),
  created_at timestamptz default now(),
  paid_at timestamptz
);

create table if not exists bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  grade_name text not null,
  kg numeric not null,
  price_satang bigint not null,           -- ราคา/กก.
  amount_satang bigint not null
);

create table if not exists bill_payments (           -- จ่าย/รับเงินบิล แบ่งได้หลายกระเป๋า
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  bill_id uuid not null references bills(id),
  wallet_id uuid not null references wallets(id),
  amount_satang bigint not null,
  created_at timestamptz default now()
);

create table if not exists wallet_txns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  wallet_id uuid not null references wallets(id),
  bill_id uuid references bills(id),
  kind text not null check (kind in ('in','out')),
  amount_satang bigint not null,
  balance_after bigint not null,
  note text default '',
  created_by uuid references profiles(user_id),
  created_at timestamptz default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null, role text default '',
  base_day_satang bigint default 0,       -- ฐาน/วัน (0 = ใช้ค่าตั้งต้นร้าน)
  com_kg_satang bigint default 0,
  bonus_satang bigint default 0,
  paid_satang bigint default 0,           -- จ่ายไปแล้วรวม
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists staff_workdays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  staff_id uuid not null references staff(id) on delete cascade,
  work_date date not null,
  kg numeric default 0,                   -- กก.ที่ทำได้วันนั้น (ใช้คิดคอม)
  unique (staff_id, work_date)
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  user_id uuid,
  action text not null,
  detail text default '',
  created_at timestamptz default now()
);

create index if not exists idx_qf2_bills on bills(tenant_id, created_at desc);
create index if not exists idx_qf2_txns on wallet_txns(wallet_id, created_at desc);
create index if not exists idx_qf2_pay on bill_payments(bill_id);
create index if not exists idx_qf2_log on activity_log(tenant_id, created_at desc);

-- ---------- helper ----------
create or replace function my_tenant() returns uuid
language sql stable security definer set search_path = public as
$$ select tenant_id from profiles where user_id = auth.uid() and status = 'active' $$;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where user_id = auth.uid() and status = 'active' $$;

create or replace function _log(p_action text, p_detail text) returns void
language sql security definer set search_path = public as
$$ insert into activity_log (tenant_id, user_id, action, detail) values (my_tenant(), auth.uid(), p_action, p_detail) $$;

-- ---------- RLS ----------
do $$ declare t text;
begin
  foreach t in array array['tenants','profiles','settings','wallets','customers','buyers','grades','bills','bill_items','bill_payments','wallet_txns','staff','staff_workdays','activity_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy t_sel on tenants for select using (id = my_tenant());
create policy t_upd on tenants for update using (id = my_tenant() and my_role() = 'owner');
create policy p_sel on profiles for select using (tenant_id = my_tenant() or user_id = auth.uid());
create policy se_sel on settings for select using (tenant_id = my_tenant());
create policy w_sel on wallets for select using (tenant_id = my_tenant());
create policy c_all_sel on customers for select using (tenant_id = my_tenant());
create policy c_ins on customers for insert with check (tenant_id = my_tenant());
create policy c_upd on customers for update using (tenant_id = my_tenant());
create policy by_sel on buyers for select using (tenant_id = my_tenant());
create policy by_ins on buyers for insert with check (tenant_id = my_tenant());
create policy by_upd on buyers for update using (tenant_id = my_tenant());
create policy g_sel on grades for select using (tenant_id = my_tenant());
create policy g_ins on grades for insert with check (tenant_id = my_tenant());
create policy g_upd on grades for update using (tenant_id = my_tenant());
create policy b_sel on bills for select using (tenant_id = my_tenant());
create policy bi_sel on bill_items for select using (exists (select 1 from bills b where b.id = bill_id and b.tenant_id = my_tenant()));
create policy bp_sel on bill_payments for select using (tenant_id = my_tenant());
create policy wt_sel on wallet_txns for select using (tenant_id = my_tenant());
create policy st_sel on staff for select using (tenant_id = my_tenant());
create policy st_ins on staff for insert with check (tenant_id = my_tenant());
create policy st_upd on staff for update using (tenant_id = my_tenant());
create policy sw_sel on staff_workdays for select using (tenant_id = my_tenant());
create policy sw_ins on staff_workdays for insert with check (tenant_id = my_tenant());
create policy sw_del on staff_workdays for delete using (tenant_id = my_tenant());
create policy al_sel on activity_log for select using (tenant_id = my_tenant());
-- เงิน/บิล/ตั้งค่า แก้ผ่าน RPC เท่านั้น

-- ---------- RPC: สมัคร/เข้าร่วมร้าน ----------
create or replace function bootstrap_tenant(p_tenant_name text, p_user_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid;
begin
  if auth.uid() is null then raise exception 'ยังไม่ได้เข้าสู่ระบบ'; end if;
  if exists (select 1 from profiles where user_id = auth.uid()) then raise exception 'บัญชีนี้มีร้านอยู่แล้ว'; end if;
  insert into tenants (name) values (coalesce(nullif(trim(p_tenant_name),''),'ร้านของฉัน')) returning id into v_tid;
  insert into profiles (user_id, tenant_id, name, role) values (auth.uid(), v_tid, coalesce(nullif(trim(p_user_name),''),'เจ้าของร้าน'), 'owner');
  insert into settings (tenant_id) values (v_tid);
  insert into wallets (tenant_id, code, name, color, icon, sort) values
    (v_tid, 'A1', 'A — โอน', '#3B82D9', 'landmark', 1),
    (v_tid, 'A2', 'A — เงินสด', '#2F9B58', 'banknote', 2),
    (v_tid, 'B1', 'B — รับเงินขาย', '#E8692E', 'hand-coins', 3),
    (v_tid, 'C1', 'C — ค่าใช้จ่าย', '#8B5CD6', 'receipt', 4);
  insert into grades (tenant_id, name, color, buy_satang, sell_satang, sort) values
    (v_tid, 'เกรด A', '#A3E635', 5200, 5600, 1),
    (v_tid, 'เกรด B', '#FF9F45', 4200, 4500, 2),
    (v_tid, 'เกรด C', '#5EA7FF', 3000, 3200, 3),
    (v_tid, 'ตกไซซ์', '#93A08D', 1500, 1700, 4);
  perform _log('tenant.create', 'สร้างร้านใหม่');
  return jsonb_build_object('tenant_id', v_tid);
end $$;

create or replace function join_tenant(p_code text, p_user_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid;
begin
  if auth.uid() is null then raise exception 'ยังไม่ได้เข้าสู่ระบบ'; end if;
  if exists (select 1 from profiles where user_id = auth.uid()) then raise exception 'บัญชีนี้อยู่ในร้านอยู่แล้ว'; end if;
  select id into v_tid from tenants where invite_code = lower(trim(p_code)) and status = 'active';
  if v_tid is null then raise exception 'รหัสเชิญไม่ถูกต้อง'; end if;
  insert into profiles (user_id, tenant_id, name, role) values (auth.uid(), v_tid, coalesce(nullif(trim(p_user_name),''),'พนักงาน'), 'staff');
  insert into activity_log (tenant_id, user_id, action, detail) values (v_tid, auth.uid(), 'user.join', coalesce(p_user_name,'พนักงาน') || ' เข้าร่วมร้าน');
  return jsonb_build_object('tenant_id', v_tid);
end $$;

-- ---------- RPC: PIN ----------
create or replace function set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'เฉพาะเจ้าของร้าน'; end if;
  update settings set pin_hash = md5('qf2:' || p_pin), updated_at = now()
    where tenant_id = my_tenant();
end $$;

create or replace function check_pin(p_pin text)
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select pin_hash = md5('qf2:' || p_pin) from settings where tenant_id = my_tenant()), false) $$;

-- ---------- RPC: เปิดบิล (atomic) ----------
-- p_items: [{grade, kg, price_satang}] · p_splits: [{wallet_code, amount_satang}] (ถ้าจ่าย/รับทันที)
create or replace function create_bill(p_type text, p_party uuid, p_items jsonb, p_note text, p_splits jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tid uuid := my_tenant(); v_no int; v_code text; v_bid uuid;
  v_kg numeric := 0; v_total bigint := 0;
  it jsonb; v_ikg numeric; v_ipr bigint;
begin
  if v_tid is null then raise exception 'ไม่พบข้อมูลผู้ใช้'; end if;
  if p_type not in ('buy','sell') then raise exception 'ประเภทบิลไม่ถูกต้อง'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'ต้องมีรายการอย่างน้อย 1 รายการ'; end if;

  perform 1 from tenants where id = v_tid for update;  -- lock กันเลขบิลชน
  for it in select * from jsonb_array_elements(p_items) loop
    v_ikg := (it->>'kg')::numeric; v_ipr := (it->>'price_satang')::bigint;
    if coalesce(trim(it->>'grade'),'') = '' or v_ikg is null or v_ikg <= 0 or v_ipr is null or v_ipr < 0 then
      raise exception 'รายการไม่ครบ (เกรด/กก./ราคา)';
    end if;
    v_kg := v_kg + v_ikg; v_total := v_total + round(v_ikg * v_ipr);
  end loop;

  select coalesce(max(no),0) + 1 into v_no from bills where tenant_id = v_tid and type = p_type;
  v_code := (case when p_type = 'buy' then 'ซ-' else 'ข-' end) || lpad(v_no::text, 3, '0');

  insert into bills (tenant_id, no, code, type, customer_id, buyer_id, total_kg, total_satang, status, note, created_by)
    values (v_tid, v_no, v_code, p_type,
            case when p_type = 'buy' then p_party end,
            case when p_type = 'sell' then p_party end,
            v_kg, v_total, 'due', coalesce(p_note,''), auth.uid())
    returning id into v_bid;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into bill_items (bill_id, grade_name, kg, price_satang, amount_satang)
      values (v_bid, trim(it->>'grade'), (it->>'kg')::numeric, (it->>'price_satang')::bigint,
              round((it->>'kg')::numeric * (it->>'price_satang')::bigint));
  end loop;

  perform _log('bill.create', 'เปิดบิล' || (case when p_type='sell' then 'ขาย ' else 'ซื้อ ' end) || v_code ||
               ' ' || to_char(v_total/100.0,'FM999,999,990.00') || ' บาท');
  if p_splits is not null and jsonb_array_length(p_splits) > 0 then
    perform pay_bill(v_bid, p_splits);
  end if;
  return jsonb_build_object('id', v_bid, 'code', v_code, 'total_satang', v_total, 'total_kg', v_kg);
end $$;

-- ---------- RPC: จ่าย/รับเงินบิล (แบ่งหลายกระเป๋า) ----------
create or replace function pay_bill(p_bill uuid, p_splits jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tid uuid := my_tenant(); b record; sp jsonb;
  v_wid uuid; v_amt bigint; v_sum bigint := 0; v_bal bigint; v_wname text;
begin
  select * into b from bills where id = p_bill and tenant_id = v_tid for update;
  if not found then raise exception 'ไม่พบบิล'; end if;
  if b.status <> 'due' then raise exception 'บิลนี้ชำระแล้วหรือถูกยกเลิก'; end if;
  if p_splits is null or jsonb_array_length(p_splits) = 0 then raise exception 'ต้องระบุกระเป๋าเงิน'; end if;

  for sp in select * from jsonb_array_elements(p_splits) loop
    v_amt := (sp->>'amount_satang')::bigint;
    if v_amt is null or v_amt <= 0 then raise exception 'จำนวนเงินไม่ถูกต้อง'; end if;
    v_sum := v_sum + v_amt;
  end loop;
  if v_sum <> b.total_satang then raise exception 'ยอดแบ่งจ่ายรวม (%) ไม่เท่ายอดบิล (%)', v_sum, b.total_satang; end if;

  for sp in select * from jsonb_array_elements(p_splits) loop
    select id, balance_satang, name into v_wid, v_bal, v_wname from wallets
      where tenant_id = v_tid and (code = sp->>'wallet_code' or id::text = sp->>'wallet_id') for update;
    if v_wid is null then raise exception 'ไม่พบกระเป๋า %', coalesce(sp->>'wallet_code', sp->>'wallet_id'); end if;
    v_amt := (sp->>'amount_satang')::bigint;
    v_bal := v_bal + case when b.type = 'sell' then v_amt else -v_amt end;
    update wallets set balance_satang = v_bal where id = v_wid;
    insert into bill_payments (tenant_id, bill_id, wallet_id, amount_satang) values (v_tid, b.id, v_wid, v_amt);
    insert into wallet_txns (tenant_id, wallet_id, bill_id, kind, amount_satang, balance_after, note, created_by)
      values (v_tid, v_wid, b.id, case when b.type='sell' then 'in' else 'out' end, v_amt, v_bal,
              (case when b.type='sell' then 'รับเงินขาย ' else 'จ่ายบิล ' end) || b.code, auth.uid());
  end loop;

  update bills set status = 'paid', paid_at = now() where id = b.id;
  perform _log('bill.pay', 'ชำระบิล ' || b.code);
  return jsonb_build_object('id', b.id, 'status', 'paid');
end $$;

-- ---------- RPC: ยกเลิกบิล ----------
create or replace function cancel_bill(p_bill uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid := my_tenant(); b record; p record; v_bal bigint;
begin
  select * into b from bills where id = p_bill and tenant_id = v_tid for update;
  if not found then raise exception 'ไม่พบบิล'; end if;
  if b.status = 'canceled' then raise exception 'บิลนี้ถูกยกเลิกไปแล้ว'; end if;
  if b.status = 'paid' then
    for p in select * from bill_payments where bill_id = b.id loop
      select balance_satang into v_bal from wallets where id = p.wallet_id for update;
      v_bal := v_bal + case when b.type = 'sell' then -p.amount_satang else p.amount_satang end;
      update wallets set balance_satang = v_bal where id = p.wallet_id;
      insert into wallet_txns (tenant_id, wallet_id, bill_id, kind, amount_satang, balance_after, note, created_by)
        values (v_tid, p.wallet_id, b.id, case when b.type='sell' then 'out' else 'in' end, p.amount_satang, v_bal,
                'ยกเลิกบิล ' || b.code, auth.uid());
    end loop;
  end if;
  update bills set status = 'canceled' where id = b.id;
  perform _log('bill.cancel', 'ยกเลิกบิล ' || b.code);
  return jsonb_build_object('id', b.id, 'status', 'canceled');
end $$;

-- ---------- RPC: กระเป๋าเงิน ----------
create or replace function wallet_txn(p_wallet_code text, p_kind text, p_amount bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid := my_tenant(); v_wid uuid; v_bal bigint; v_name text;
begin
  if p_kind not in ('in','out') then raise exception 'ประเภทไม่ถูกต้อง'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินไม่ถูกต้อง'; end if;
  select id, balance_satang, name into v_wid, v_bal, v_name from wallets where tenant_id = v_tid and code = p_wallet_code for update;
  if v_wid is null then raise exception 'ไม่พบกระเป๋า %', p_wallet_code; end if;
  v_bal := v_bal + case when p_kind = 'in' then p_amount else -p_amount end;
  update wallets set balance_satang = v_bal where id = v_wid;
  insert into wallet_txns (tenant_id, wallet_id, kind, amount_satang, balance_after, note, created_by)
    values (v_tid, v_wid, p_kind, p_amount, v_bal, coalesce(p_note,''), auth.uid());
  perform _log('wallet.txn', (case when p_kind='in' then 'เข้า ' else 'ออก ' end) || v_name || ' ' || to_char(p_amount/100.0,'FM999,999,990.00') || ' บาท');
  return jsonb_build_object('balance_satang', v_bal);
end $$;

create or replace function wallet_transfer(p_from text, p_to text, p_amount bigint, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid := my_tenant(); f record; t record; v_fb bigint; v_tb bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินไม่ถูกต้อง'; end if;
  select * into f from wallets where tenant_id = v_tid and code = p_from for update;
  select * into t from wallets where tenant_id = v_tid and code = p_to for update;
  if f.id is null or t.id is null then raise exception 'ไม่พบกระเป๋า'; end if;
  v_fb := f.balance_satang - p_amount; v_tb := t.balance_satang + p_amount;
  update wallets set balance_satang = v_fb where id = f.id;
  update wallets set balance_satang = v_tb where id = t.id;
  insert into wallet_txns (tenant_id, wallet_id, kind, amount_satang, balance_after, note, created_by) values
    (v_tid, f.id, 'out', p_amount, v_fb, 'โอนไป ' || t.name || coalesce(' · '||nullif(p_note,''),''), auth.uid()),
    (v_tid, t.id, 'in',  p_amount, v_tb, 'รับโอนจาก ' || f.name || coalesce(' · '||nullif(p_note,''),''), auth.uid());
  perform _log('wallet.transfer', f.name || ' → ' || t.name || ' ' || to_char(p_amount/100.0,'FM999,999,990.00') || ' บาท');
  return jsonb_build_object('from_balance', v_fb, 'to_balance', v_tb);
end $$;

-- ---------- RPC: จ่ายค่าแรงพนักงาน ----------
create or replace function pay_staff(p_staff uuid, p_amount bigint, p_wallet_code text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tid uuid := my_tenant(); s record; v_wid uuid; v_bal bigint; v_wname text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'จำนวนเงินไม่ถูกต้อง'; end if;
  select * into s from staff where id = p_staff and tenant_id = v_tid for update;
  if not found then raise exception 'ไม่พบพนักงาน'; end if;
  select id, balance_satang, name into v_wid, v_bal, v_wname from wallets where tenant_id = v_tid and code = p_wallet_code for update;
  if v_wid is null then raise exception 'ไม่พบกระเป๋า %', p_wallet_code; end if;
  v_bal := v_bal - p_amount;
  update wallets set balance_satang = v_bal where id = v_wid;
  update staff set paid_satang = paid_satang + p_amount where id = s.id;
  insert into wallet_txns (tenant_id, wallet_id, kind, amount_satang, balance_after, note, created_by)
    values (v_tid, v_wid, 'out', p_amount, v_bal, 'ค่าแรง ' || s.name || coalesce(' · '||nullif(p_note,''),''), auth.uid());
  perform _log('staff.pay', 'จ่ายค่าแรง ' || s.name || ' ' || to_char(p_amount/100.0,'FM999,999,990.00') || ' บาท');
  return jsonb_build_object('paid_satang', (select paid_satang from staff where id = s.id));
end $$;

-- ---------- RPC: อัปเดตตั้งค่า/ราคา (owner) ----------
create or replace function update_settings(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() <> 'owner' then raise exception 'เฉพาะเจ้าของร้าน'; end if;
  update settings set
    pin_on_pay = coalesce((p->>'pin_on_pay')::boolean, pin_on_pay),
    pin_on_delete = coalesce((p->>'pin_on_delete')::boolean, pin_on_delete),
    pin_on_rate = coalesce((p->>'pin_on_rate')::boolean, pin_on_rate),
    base_day_satang = coalesce((p->>'base_day_satang')::bigint, base_day_satang),
    com_kg_satang = coalesce((p->>'com_kg_satang')::bigint, com_kg_satang),
    updated_at = now()
  where tenant_id = my_tenant();
  perform _log('settings.update', 'แก้ไขตั้งค่า');
end $$;

-- ---------- สิทธิ์ ----------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on tenants, profiles, settings, wallets, bills, bill_items, bill_payments, wallet_txns, activity_log to authenticated;
grant select, insert, update on customers, buyers, grades, staff to authenticated;
grant select, insert, delete on staff_workdays to authenticated;
grant update on tenants to authenticated;

revoke all on all functions in schema public from anon, authenticated;
grant execute on function my_tenant(), my_role() to authenticated;
grant execute on function bootstrap_tenant(text, text), join_tenant(text, text) to authenticated;
grant execute on function set_pin(text), check_pin(text) to authenticated;
grant execute on function create_bill(text, uuid, jsonb, text, jsonb) to authenticated;
grant execute on function pay_bill(uuid, jsonb), cancel_bill(uuid) to authenticated;
grant execute on function wallet_txn(text, text, bigint, text), wallet_transfer(text, text, bigint, text) to authenticated;
grant execute on function pay_staff(uuid, bigint, text, text) to authenticated;
grant execute on function update_settings(jsonb) to authenticated;
