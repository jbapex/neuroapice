-- Índice para a aba "Minha Galeria" (query de todas as runs ordenadas por data).
-- Execute este arquivo sozinho no SQL Editor após o de imagens.
CREATE INDEX IF NOT EXISTS idx_neurodesign_runs_created_at
  ON neurodesign_generation_runs (created_at DESC);
