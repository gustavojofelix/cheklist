-- =====================================================================
-- 0015 · Security fix: checkout_quote authorised every caller.
--
-- private.is_service() answers "is this code running as the database owner?".
-- Inside a SECURITY DEFINER function that is ALWAYS true, so it must only be used
-- in trigger guards (to let trusted server functions change protected fields),
-- never to authorise the caller of a definer function. Caller checks use
-- auth.uid()/auth.role() or the private.org_role/can_* helpers.
-- Found by the pgTAP suite ("another account cannot buy for A").
-- =====================================================================
create or replace function public.checkout_quote(org uuid, p_price uuid default null, p_addon text default null,
                                                 p_voucher text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_root uuid := private.root_org(org); pr record; ad record; v record;
        v_amount numeric(12,2); v_currency text; v_plan uuid; v_discount numeric(12,2) := 0; v_voucher_ok boolean := null;
        v_voucher_id uuid; v_period text;
begin
  if not (private.org_role(v_root) = 'admin' or coalesce(auth.role(), '') = 'service_role') then raise exception 'forbidden' using errcode = '42501'; end if;
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

comment on function private.is_service() is
  'True when running as the DB owner/service role. Trigger guards only — never for caller authorisation inside SECURITY DEFINER functions.';
