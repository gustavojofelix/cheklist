-- 0019 · my_context(): also remove the default PUBLIC grant (anon inherited EXECUTE through it).
revoke execute on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated, service_role;
