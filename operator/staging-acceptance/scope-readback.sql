-- TEMPLATE ONLY. Coordinator binds :fresh_agent_id and :organization_id using
-- existing authorized read-only tooling. Do NOT substitute a bearer into SQL.
-- Do NOT select any old bearer or search for/recover its token hash.
-- Keep this result in parent/child process memory; it contains a verifier.
BEGIN TRANSACTION READ ONLY;
SELECT json_build_object(
  'observed_at', CURRENT_TIMESTAMP,
  'principal', json_build_object(
    'id', a.id, 'organization_id', a.organization_id,
    'delegated_by_user_id', a.delegated_by_user_id,
    'token_sha256', a.token_hash,
    'allowed_tools', a.allowed_tools_json::json,
    'context_ids', a.context_ids_json::json,
    'assignee_ids', a.assignee_ids_json::json,
    'contract_ids', a.contract_ids_json::json,
    'calendar_targets', a.calendar_targets_json::json,
    'require_approval', a.require_approval,
    'max_actions_per_run', a.max_actions_per_run,
    'created_at', a.created_at, 'expires_at', a.expires_at,
    'revoked_at', a.revoked_at,
    'status', CASE WHEN a.revoked_at IS NOT NULL THEN 'revoked'
                   WHEN a.expires_at <= CURRENT_TIMESTAMP THEN 'expired' ELSE 'active' END,
    'delegator_role', m.role,
    'run_count', (SELECT count(*) FROM agent_runs r WHERE r.agent_id = a.id)
  )
)
FROM agent_principals a
LEFT JOIN organization_memberships m ON m.organization_id = a.organization_id AND m.user_id = a.delegated_by_user_id
WHERE a.id = :fresh_agent_id AND a.organization_id = :organization_id;
ROLLBACK;

-- SEPARATE POST-DENIAL QUERY: no verifier/bearer is selected or reused.
-- Root correlates this observation with the observer's baseline/final timestamps.
BEGIN TRANSACTION READ ONLY;
SELECT CURRENT_TIMESTAMP AS observed_at, a.id, a.organization_id,
       a.created_at, a.expires_at, a.revoked_at, m.role AS delegator_role,
       (SELECT count(*) FROM agent_runs r WHERE r.agent_id = a.id) AS run_count
FROM agent_principals a
LEFT JOIN organization_memberships m
  ON m.organization_id = a.organization_id AND m.user_id = a.delegated_by_user_id
WHERE a.id = :fresh_agent_id AND a.organization_id = :organization_id;
ROLLBACK;
