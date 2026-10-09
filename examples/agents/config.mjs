/** No environment values are included in validation errors. */
export function configurationFromEnv(env = process.env) {
  const required = (name, max = 256) => {
    const value = env[name]?.trim();
    if (!value || value.length > max) throw new Error(`Supply ${name} explicitly (at most ${max} characters).`);
    return value;
  };
  const dueAt = instant(required("LENSLAYER_DUE_AT"), "LENSLAYER_DUE_AT");
  const deadlineAt = instant(required("LENSLAYER_DEADLINE_AT"), "LENSLAYER_DEADLINE_AT");
  const renewalDate = env.LENSLAYER_RENEWAL_DATE?.trim();
  const noticeDays = env.LENSLAYER_NOTICE_DAYS?.trim();
  if (Boolean(renewalDate) !== Boolean(noticeDays)) throw new Error("Supply both LENSLAYER_RENEWAL_DATE and LENSLAYER_NOTICE_DAYS, or omit both. Missing dates are never inferred.");
  let deadlineBasis;
  if (renewalDate && noticeDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate) || !validCalendarDate(renewalDate)) throw new Error("LENSLAYER_RENEWAL_DATE must be a real calendar date in YYYY-MM-DD format.");
    const days = Number(noticeDays);
    if (!/^\d+$/.test(noticeDays) || !Number.isInteger(days) || days < 0 || days > 3650) throw new Error("LENSLAYER_NOTICE_DAYS must be an integer from 0 to 3650.");
    const calculated = new Date(`${renewalDate}T00:00:00Z`);
    calculated.setUTCDate(calculated.getUTCDate() - days);
    if (calculated.toISOString().slice(0, 10) !== dueAt.slice(0, 10)) throw new Error("The explicit due date's UTC date does not match the supplied renewal date minus notice days.");
    deadlineBasis = { renewal_date: renewalDate, notice_days: days };
  }
  const timeoutMs = Number(env.LENSLAYER_POLL_TIMEOUT_MS || 300000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 86400000) throw new Error("LENSLAYER_POLL_TIMEOUT_MS must be an integer from 1 to 86400000.");
  const dashboard = new URL(env.LENSLAYER_DASHBOARD_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(dashboard.protocol) || dashboard.username || dashboard.password || dashboard.search || dashboard.hash) throw new Error("LENSLAYER_DASHBOARD_URL must not contain credentials, query parameters, or a fragment.");
  const query = env.LENSLAYER_EVIDENCE_QUERY?.trim() || "renew";
  if (query.length < 2 || query.length > 200) throw new Error("LENSLAYER_EVIDENCE_QUERY must be a literal source phrase of 2 to 200 characters.");
  return {
    baseUrl: env.LENSLAYER_API_URL || "http://127.0.0.1:8000", token: required("LENSLAYER_AGENT_TOKEN"),
    dashboardUrl: dashboard.toString().replace(/\/$/, ""), contractId: required("LENSLAYER_CONTRACT_ID", 64), assigneeId: required("LENSLAYER_ASSIGNEE_ID", 64),
    dueAt, deadlineAt, runKey: required("LENSLAYER_RUN_KEY", 128), actionKey: required("LENSLAYER_ACTION_KEY", 128), query,
    versionId: env.LENSLAYER_VERSION_ID?.trim() || undefined, deadlineBasis, timeoutMs,
  };
}

function instant(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !validCalendarDate(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO 8601 date-time with an explicit timezone.`);
  return new Date(value).toISOString();
}

function validCalendarDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
