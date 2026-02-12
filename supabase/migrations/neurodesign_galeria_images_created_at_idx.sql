-- Índice para a aba "Minha Galeria" (query de todas as imagens ordenadas por data).
-- Execute este arquivo sozinho no SQL Editor. Se der connection timeout, tente em horário de menos uso.
CREATE INDEX IF NOT EXISTS idx_neurodesign_images_created_at
  ON neurodesign_generated_images (created_at DESC);
