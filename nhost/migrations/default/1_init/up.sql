-- ============================================================
-- AI Agent Workflow Builder — Database Schema
-- ============================================================

-- Enable uuid-ossp for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed');
CREATE TYPE step_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval');

-- ============================================================
-- ORGANIZATIONS
-- ============================================================

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  quota_limit INTEGER NOT NULL DEFAULT 100,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON public.organizations(slug);

-- ============================================================
-- ORG MEMBERS (join table: users <-> organizations)
-- ============================================================

CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.org_members(user_id);
CREATE INDEX idx_org_members_org ON public.org_members(org_id);
CREATE INDEX idx_org_members_org_user ON public.org_members(org_id, user_id);

-- ============================================================
-- WORKFLOWS
-- ============================================================

CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflows_org ON public.workflows(org_id);

-- ============================================================
-- WORKFLOW STEPS
-- ============================================================

CREATE TABLE public.workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  step_type step_type NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_steps_workflow ON public.workflow_steps(workflow_id);
CREATE INDEX idx_workflow_steps_order ON public.workflow_steps(workflow_id, step_order);

-- ============================================================
-- WORKFLOW TRIGGERS
-- ============================================================

CREATE TABLE public.workflow_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type trigger_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_triggers_workflow ON public.workflow_triggers(workflow_id);

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================

CREATE TABLE public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type trigger_type NOT NULL DEFAULT 'manual',
  status run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_runs_workflow ON public.workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON public.workflow_runs(status);

-- ============================================================
-- STEP RUNS
-- ============================================================

CREATE TABLE public.step_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  status step_status NOT NULL DEFAULT 'pending',
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_step_runs_run ON public.step_runs(run_id);
CREATE INDEX idx_step_runs_step ON public.step_runs(step_id);
CREATE INDEX idx_step_runs_status ON public.step_runs(status);

-- ============================================================
-- WATCHED EVENTS TABLE (for database_event triggers)
-- ============================================================

CREATE TABLE public.watched_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watched_events_type ON public.watched_events(event_type);
CREATE INDEX idx_watched_events_processed ON public.watched_events(processed);

-- ============================================================
-- WORKFLOW RESULTS TABLE (for db_write steps)
-- ============================================================

CREATE TABLE public.workflow_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  result_type TEXT NOT NULL DEFAULT 'generic',
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_results_workflow ON public.workflow_results(workflow_id);
CREATE INDEX idx_workflow_results_run ON public.workflow_results(run_id);

-- ============================================================
-- AGGREGATION VIEW: Org usage stats
-- ============================================================

CREATE OR REPLACE VIEW public.org_usage_stats AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.quota_limit,
  o.quota_used,
  (o.quota_limit - o.quota_used) AS quota_remaining,
  o.quota_period_start,
  COALESCE(run_stats.total_runs, 0) AS total_runs_this_period,
  COALESCE(run_stats.avg_duration_seconds, 0) AS avg_run_duration_seconds,
  COALESCE(run_stats.completed_runs, 0) AS completed_runs,
  COALESCE(run_stats.failed_runs, 0) AS failed_runs
FROM public.organizations o
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE wr.status = 'completed') AS completed_runs,
    COUNT(*) FILTER (WHERE wr.status = 'failed') AS failed_runs,
    AVG(EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at)))
      FILTER (WHERE wr.completed_at IS NOT NULL) AS avg_duration_seconds
  FROM public.workflow_runs wr
  JOIN public.workflows w ON w.id = wr.workflow_id
  WHERE w.org_id = o.id
    AND wr.started_at >= o.quota_period_start
) run_stats ON true;

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_steps_updated_at
  BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_triggers_updated_at
  BEFORE UPDATE ON public.workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_workflow_runs_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_step_runs_updated_at
  BEFORE UPDATE ON public.step_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- QUOTA RESET FUNCTION (called monthly or on demand)
-- ============================================================

CREATE OR REPLACE FUNCTION public.reset_quota_if_needed(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.organizations
  SET quota_used = 0,
      quota_period_start = date_trunc('month', NOW())
  WHERE id = p_org_id
    AND quota_period_start < date_trunc('month', NOW());
END;
$$ LANGUAGE plpgsql;
