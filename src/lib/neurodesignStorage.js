import { supabase } from '@/lib/customSupabaseClient';
import { v4 as uuidv4 } from 'uuid';

const BUCKET = 'neurodesign';
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Upload de arquivo para o bucket neurodesign.
 * @param {string} userId - auth user id
 * @param {string} projectId - neurodesign project id
 * @param {'subject'|'scenario'|'style_refs'|'logo'} type - pasta do tipo
 * @param {File} file
 * @returns {Promise<string>} URL pública
 */
export async function uploadNeuroDesignFile(userId, projectId, type, file) {
  if (!file || !userId || !projectId) {
    throw new Error('userId, projectId e file são obrigatórios');
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('Arquivo muito grande. Máximo 10MB.');
  }
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  const hasAllowedType = ALLOWED_TYPES.includes(file.type) || (file.type === '' && allowedExtensions.includes(ext));
  if (!hasAllowedType) {
    throw new Error('Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.');
  }
  const fileName = `${uuidv4()}.${ext}`;
  const filePath = `${userId}/projects/${projectId}/${type}/${fileName}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return publicUrl;
}
