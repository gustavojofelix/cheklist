-- =====================================================================
-- 0014 · Billing flows: quotes & vouchers, payment confirmation (single path
--        for every gateway), invoices, cancellation, subscription lifecycle,
--        quota warnings, monthly digest
-- =====================================================================

alter table public.payments
  add column kind text not null default 'subscription' check (kind in ('subscription','storage_addon')),
  add column meta jsonb not null default '{}';

create sequence public.invoice_number_seq;

insert into public.platform_settings (key, value) values
  ('bank_details', '"Banco: (a definir)\nTitular: Law Technology Solutions\nNIB: (a definir)\nReferência: indique o número da factura"'),
  ('manual_invoice_due_days', '7')
on conflict (key) do nothing;

create table public.quota_warnings_sent (
  organization_id uuid not null references public.organizations on delete cascade,
  metric          text not null,
  threshold       int  not null,
  period_start    timestamptz not null,
  sent_at         timestamptz not null default now(),
  primary key (organization_id, metric, threshold, period_start)
);
alter table public.quota_warnings_sent enable row level security;
create policy qws_read on public.quota_warnings_sent for select to authenticated using (private.is_platform());

-- ----------------------------------------------------------------- quote
-- Server-side price calculation (the browser never decides the amount).
create or replace function public.checkout_quote(org uuid, p_price uuid default null, p_addon text default null,
                                                 p_voucher text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_root uuid := private.root_org(org); pr record; ad record; v record;
        v_amount numeric(12,2); v_currency text; v_plan uuid; v_discount numeric(12,2) := 0; v_voucher_ok boolean := null;
        v_voucher_id uuid; v_period text;
begin
  if not (private.org_role(v_root) = 'admin' or private.is_service()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_price is not null then
    select pp.*, pl.is_active as plan_active into pr from public.plan_prices pp join public.plans pl on pl.id = pp.plan_id
     where pp.id = p_price and pp.is_active;
    if not found or not pr.plan_active then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_amount := pr.amount; v_currency := pr.currency; v_plan := pr.plan_id; v_period := pr.period::text;
  elsif p_addon is not null then
    select * into ad from public.addons where code = p_addon and is_active;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
    v_amount := ad.amount; v_currency := ad.currency;
  else
    raise exception 'nothing_to_buy' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_voucher), '') <> '' then
    select * into v from public.vouchers where code = upper(trim(p_voucher))::extensions.citext and is_active
       and (valid_from is null or valid_from <= now()) and (valid_until is null or valid_until > now())
       and (max_uses is null or uses_count < max_uses) and (plan_id is null or plan_id = v_plan);
    v_voucher_ok := found;
    if found then
      v_voucher_id := v.id;
      v_discount := least(v_amount, case when v.discount_type = 'percentage' then round(v_amount * v.discount_value / 100, 2)
                                         else v.discount_value end);
    end if;
  end if;
  return jsonb_build_object('amount', v_amount - v_discount, 'original', v_amount, 'discount', v_discount,
                            'currency', v_currency, 'plan_id', v_plan, 'voucher_valid', v_voucher_ok,
                            'voucher_id', v_voucher_id, 'period', v_period);
end $$;

-- ------------------------------------------------- single confirmation path
-- Called by the Stripe/SISLOG webhooks (service role) and by superadmins for bank transfers.
create or replace function private.confirm_payment(p_payment uuid, p_gateway_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p record; s record; v_len interval; v_start timestamptz; pr record;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.status = 'paid' then return; end if;                -- idempotent
  update public.payments set status = 'paid', paid_at = now(), gateway_ref = coalesce(p_gateway_ref, gateway_ref) where id = p.id;

  select * into s from public.subscriptions where organization_id = p.organization_id for update;
  if p.kind = 'storage_addon' then
    update public.subscriptions set extra_storage_bytes = extra_storage_bytes + 5368709120 where id = s.id;
  else
    select * into pr from public.plan_prices where id = p.plan_price_id;
    v_len := case pr.period when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months'
                            when 'semestral' then interval '6 months' else interval '1 year' end;
    -- renewing the same plan extends from the current end; anything else starts today
    v_start := case when s.status in ('active','past_due') and s.plan_price_id = pr.id and s.current_period_end > now()
                    then s.current_period_end else now() end;
    update public.subscriptions set plan_id = pr.plan_id, plan_price_id = pr.id, status = 'active', trial_ends_at = null,
           current_period_start = v_start, current_period_end = v_start + v_len, grace_until = null,
           cancel_at_period_end = false, canceled_at = null, gateway = p.gateway
     where id = s.id;
  end if;

  if p.voucher_id is not null then
    update public.vouchers set uses_count = uses_count + 1 where id = p.voucher_id;
    insert into public.voucher_redemptions (voucher_id, user_id, organization_id, payment_id, amount_discounted)
    values (p.voucher_id, p.created_by, p.organization_id, p.id, p.amount_discounted);
  end if;
  update public.invoices set status = 'paid', paid_at = now() where payment_id = p.id and status <> 'paid';
  insert into public.officegest_sync (payment_id) values (p.id) on conflict do nothing;
  perform private.call_function('officegest-sync');
  perform audit.write('payment.confirmed', p.organization_id, 'payments', p.id, p.amount || ' ' || p.currency, null,
                      jsonb_build_object('gateway', p.gateway, 'kind', p.kind), null);
end $$;

create or replace function private.fail_payment(p_payment uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set status = 'failed', meta = meta || jsonb_build_object('failure', p_reason)
   where id = p_payment and status = 'pending';
$$;

-- Service-role entry points for the webhooks.
create or replace function public.webhook_confirm_payment(p_payment uuid, p_gateway_ref text)
returns void language sql security definer set search_path = '' as $$ select private.confirm_payment(p_payment, p_gateway_ref) $$;
create or replace function public.webhook_fail_payment(p_payment uuid, p_reason text)
returns void language sql security definer set search_path = '' as $$ select private.fail_payment(p_payment, p_reason) $$;

-- Superadmin: bank transfer received for an invoice.
create or replace function public.admin_mark_invoice_paid(p_invoice uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if not private.is_platform('superadmin') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into i from public.invoices where id = p_invoice;
  if not found or i.payment_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.invoices set confirmed_by = auth.uid() where id = i.id;
  update public.payments set meta = meta || jsonb_build_object('confirmation_note', p_note) where id = i.payment_id;
  perform private.confirm_payment(i.payment_id, 'manual:' || i.number);
end $$;

-- Manual invoices get sequential numbers.
create or replace function private.invoice_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.number is null then
    new.number := 'CL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;
create trigger invoices_number before insert on public.invoices for each row execute function private.invoice_number();

-- ------------------------------------------------------------- cancellation
create or replace function public.cancel_subscription(org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_root uuid := private.root_org(org);
begin
  if private.org_role(v_root) is distinct from 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.subscriptions set status = 'canceled', canceled_at = now(), cancel_at_period_end = true
   where organization_id = v_root and status in ('active','past_due');
  if not found then raise exception 'nothing_to_cancel' using errcode = 'P0001'; end if;
end $$;

-- ------------------------------------------------------- lifecycle (hourly)
create or replace function private.subscription_lifecycle()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_grace int := coalesce((private.setting('grace_days'))::int, 7); n_exp int := 0; n_due int := 0;
begin
  for r in select s.*, o.name from public.subscriptions s join public.organizations o on o.id = s.organization_id
            where (s.status = 'trial' and s.trial_ends_at < now())
               or (s.status = 'canceled' and s.current_period_end < now())
               or (s.status = 'past_due' and coalesce(s.grace_until, s.current_period_end) < now())
            for update of s loop
    update public.subscriptions set status = 'expired' where id = r.id;
    perform private.notify_admins(r.organization_id, 'subscription_expired', jsonb_build_object('organization', r.name));
    n_exp := n_exp + 1;
  end loop;
  for r in select s.*, o.name from public.subscriptions s join public.organizations o on o.id = s.organization_id
            where s.status = 'active' and s.current_period_end < now() for update of s loop
    update public.subscriptions set status = 'past_due', grace_until = r.current_period_end + make_interval(days => v_grace) where id = r.id;
    perform private.notify_admins(r.organization_id, 'payment_due', jsonb_build_object('organization', r.name,
              'grace', to_char(r.current_period_end + make_interval(days => v_grace), 'DD/MM/YYYY'),
              'link', private.app_url() || '/billing'));
    n_due := n_due + 1;
  end loop;
  perform private.dispatch_emails();
  return jsonb_build_object('expired', n_exp, 'past_due', n_due);
end $$;

create or replace function private.notify_admins(p_org uuid, p_template text, p_vars jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare e text;
begin
  for e in select p.email from public.memberships m join public.profiles p on p.id = m.user_id and p.status = 'active'
            where m.org_id = p_org and m.role = 'admin' loop
    perform private.enqueue_email(e, p_template, p_vars, p_org);
  end loop;
end $$;

-- ---------------------------------------------------------- quota warnings
create or replace function private.quota_warnings()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; t int; n int := 0;
begin
  if not coalesce((private.setting('quota_warnings_enabled'))::boolean, true) then return 0; end if;
  for r in
    with acc as (
      select s.organization_id, s.current_period_start, l.*
        from public.subscriptions s cross join lateral private.effective_limits(s.organization_id) l
       where s.status in ('trial','active','past_due')
    ), used as (
      select a.*, o.name,
             (select count(*) from public.documents d where d.organization_id in (select private.account_orgs(a.organization_id)) and d.deleted_at is null) as docs,
             (select coalesce(sum(size_bytes), 0) from public.documents d where d.organization_id in (select private.account_orgs(a.organization_id)) and d.deleted_at is null) as bytes,
             (select count(distinct m.user_id) from public.memberships m where m.org_id in (select private.account_orgs(a.organization_id))) as users
        from acc a join public.organizations o on o.id = a.organization_id
    )
    select organization_id, current_period_start, name, metric, used_v, max_v
      from used, lateral (values ('documents', docs::numeric, max_documents::numeric), ('storage', bytes::numeric, max_storage_bytes::numeric),
                                 ('users', users::numeric, max_users::numeric)) x(metric, used_v, max_v)
     where max_v is not null and max_v > 0 and used_v >= max_v * 0.8
  loop
    t := case when r.used_v >= r.max_v * 0.95 then 95 else 80 end;
    insert into public.quota_warnings_sent (organization_id, metric, threshold, period_start)
    values (r.organization_id, r.metric, t, r.current_period_start) on conflict do nothing;
    if found then
      perform private.notify_admins(r.organization_id, 'quota_warning', jsonb_build_object('organization', r.name,
                'metric', r.metric, 'percent', t, 'link', private.app_url() || '/billing'));
      n := n + 1;
    end if;
  end loop;
  perform private.dispatch_emails();
  return n;
end $$;

-- ------------------------------------------------------------ monthly digest
create or replace function private.monthly_digest()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; e text;
begin
  for r in
    select o.id, o.name,
           count(*) filter (where not s.is_category) as total,
           count(*) filter (where not s.is_category and s.compliance_state = 'regular') as regular,
           count(*) filter (where not s.is_category and s.compliance_state = 'atencao') as atencao,
           count(*) filter (where not s.is_category and s.compliance_state = 'critico') as critico
      from public.organizations o join public.checklist_items_state s on s.organization_id = o.id
     where o.monthly_digest and o.deleted_at is null and private.access_mode(o.id) = 'full'
     group by o.id, o.name
  loop
    foreach e in array private.notification_recipients(r.id, null) loop
      perform private.enqueue_email(e, 'monthly_digest', jsonb_build_object('organization', r.name, 'total', r.total,
                'regular', r.regular, 'atencao', r.atencao, 'critico', r.critico,
                'link', private.app_url() || '/entities/' || r.id || '/ficha'), r.id);
      n := n + 1;
    end loop;
  end loop;
  perform private.dispatch_emails();
  return n;
end $$;

-- ------------------------------------------------------------------ e-mails
insert into public.email_templates (key, locale, subject, body_md) values
('payment_due','pt','Pagamento pendente — {{organization}}',
 E'O período da subscrição de {{organization}} terminou e o pagamento ainda não foi recebido.\n\nA conta continua activa até {{grace}}; depois disso passa a só leitura.\n\nRenovar:\n{{link}}'),
('payment_due','en','Payment due — {{organization}}',
 E'The subscription period of {{organization}} has ended and payment has not been received.\n\nThe account stays active until {{grace}}; after that it becomes read-only.\n\nRenew:\n{{link}}'),
('subscription_expired','pt','Subscrição expirada — {{organization}}',
 E'A subscrição de {{organization}} expirou. Os dados continuam disponíveis em modo só leitura.\n\nPara voltar a editar, escolha um plano na área Subscrições.'),
('subscription_expired','en','Subscription expired — {{organization}}',
 E'The subscription of {{organization}} has expired. Your data remains available read-only.\n\nTo edit again, choose a plan under Subscriptions.'),
('quota_warning','pt','{{organization}}: {{percent}}% da quota de {{metric}}',
 E'A organização {{organization}} já utiliza {{percent}}% da quota de {{metric}} do plano.\n\nVer utilização e planos:\n{{link}}'),
('quota_warning','en','{{organization}}: {{percent}}% of the {{metric}} quota',
 E'{{organization}} is using {{percent}}% of its {{metric}} quota.\n\nSee usage and plans:\n{{link}}'),
('monthly_digest','pt','Resumo mensal de conformidade — {{organization}}',
 E'Resumo de {{organization}}:\n\n• Itens: {{total}}\n• Regular: {{regular}}\n• Atenção: {{atencao}}\n• Crítico: {{critico}}\n\nAbrir a ficha:\n{{link}}'),
('monthly_digest','en','Monthly compliance digest — {{organization}}',
 E'Summary for {{organization}}:\n\n• Items: {{total}}\n• Compliant: {{regular}}\n• Attention: {{atencao}}\n• Critical: {{critico}}\n\nOpen the entity file:\n{{link}}')
on conflict (key, locale) do update set subject = excluded.subject, body_md = excluded.body_md;

-- ---------------------------------------------------------------- schedules
select cron.schedule('subscription-lifecycle', '15 * * * *', $$ select private.subscription_lifecycle(); $$);
select cron.schedule('quota-warnings', '0 6 * * *', $$ select private.quota_warnings(); $$);
select cron.schedule('monthly-digest', '0 6 1 * *', $$ select private.monthly_digest(); $$);
select cron.schedule('officegest-retry', '*/15 * * * *',
  $$ select private.call_function('officegest-sync') where exists (select 1 from public.officegest_sync where status <> 'synced'); $$);

-- ------------------------------------------------------------------- grants
revoke execute on function public.webhook_confirm_payment(uuid, text), public.webhook_fail_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.webhook_confirm_payment(uuid, text), public.webhook_fail_payment(uuid, text) to service_role;
revoke execute on function public.checkout_quote(uuid, uuid, text, text), public.admin_mark_invoice_paid(uuid, text),
  public.cancel_subscription(uuid) from public, anon;
grant execute on function public.checkout_quote(uuid, uuid, text, text), public.admin_mark_invoice_paid(uuid, text),
  public.cancel_subscription(uuid) to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to anon, authenticated, service_role;
grant usage on sequence public.invoice_number_seq to service_role;
