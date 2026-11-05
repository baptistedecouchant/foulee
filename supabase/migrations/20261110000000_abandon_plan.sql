-- Supprimer (abandonner) un entraînement depuis l'app. Les plans ne sont pas modifiables
-- directement par le client : cette fonction ne change que le statut, et seulement pour
-- son propriétaire. Les points déjà gagnés restent dans le journal.
create or replace function public.abandon_plan(p_plan uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  update plans set status = 'abandoned' where id = p_plan and user_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'plan_not_found';
  end if;
end $$;
revoke all on function public.abandon_plan(uuid) from public, anon;
grant execute on function public.abandon_plan(uuid) to authenticated;
