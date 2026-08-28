-- Secure KCA v2 submission RPC.
-- Prevents silent frontend save failures and stores a complete run + responses atomically.

create or replace function public.kca_submit_assessment(
  p_definition_version text,
  p_assessment_type text,
  p_context jsonb,
  p_safety_flags jsonb,
  p_adaptive_assignment jsonb,
  p_score_snapshot jsonb,
  p_big3_candidates jsonb,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_response jsonb;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_definition_version is null or trim(p_definition_version) = '' then
    raise exception 'definition_version_required';
  end if;

  if p_responses is null or jsonb_typeof(p_responses) <> 'array' then
    raise exception 'responses_must_be_array';
  end if;

  insert into public.kca_assessment_definitions (
    definition_version,
    schema_version,
    title,
    definition
  ) values (
    p_definition_version,
    p_definition_version,
    'GodHealth Kingdom Capacity Assessment v2',
    '{}'::jsonb
  ) on conflict (definition_version) do nothing;

  insert into public.kca_assessment_runs (
    user_id,
    definition_version,
    assessment_type,
    status,
    context,
    safety_flags,
    adaptive_assignment,
    score_snapshot,
    big3_candidates,
    submitted_at
  ) values (
    v_user_id,
    p_definition_version,
    coalesce(nullif(p_assessment_type, ''), 'baseline'),
    case
      when coalesce((p_safety_flags->>'stop_normal_recommendation_flow')::boolean, false) then 'safety_paused'
      else 'submitted'
    end,
    coalesce(p_context, '{}'::jsonb),
    coalesce(p_safety_flags, '{}'::jsonb),
    coalesce(p_adaptive_assignment, '{}'::jsonb),
    coalesce(p_score_snapshot, '{}'::jsonb),
    coalesce(p_big3_candidates, '{}'::jsonb),
    now()
  )
  returning id into v_run_id;

  for v_response in select * from jsonb_array_elements(p_responses)
  loop
    insert into public.kca_responses (
      run_id,
      user_id,
      question_id,
      question_role,
      answer_value,
      answer_text
    ) values (
      v_run_id,
      v_user_id,
      v_response->>'question_id',
      v_response->>'question_role',
      case
        when v_response ? 'answer_value' and v_response->>'answer_value' <> '' then (v_response->>'answer_value')::integer
        else null
      end,
      nullif(v_response->>'answer_text', '')
    );
  end loop;

  insert into public.kca_audit_events (
    run_id,
    user_id,
    event_type,
    metadata
  ) values (
    v_run_id,
    v_user_id,
    'assessment_submitted',
    jsonb_build_object(
      'definition_version', p_definition_version,
      'response_count', jsonb_array_length(p_responses)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id
  );
end;
$$;

grant execute on function public.kca_submit_assessment(text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
