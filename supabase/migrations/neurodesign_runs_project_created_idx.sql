-- Índice composto para a query de runs (project_id + created_at DESC)
-- Evita timeout ao carregar execuções do projeto ordenadas por data.
CREATE INDEX IF NOT EXISTS idx_neurodesign_runs_project_created
  ON neurodesign_generation_runs (project_id, created_at DESC);
