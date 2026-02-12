-- Índice composto para a query da galeria (project_id + created_at DESC)
-- Evita timeout ao carregar imagens do projeto ordenadas por data.
CREATE INDEX IF NOT EXISTS idx_neurodesign_images_project_created
  ON neurodesign_generated_images (project_id, created_at DESC);
