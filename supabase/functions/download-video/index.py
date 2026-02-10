"""
Edge Function: download-video
Usa yt-dlp para baixar vídeos do YouTube, Instagram, etc.
Faz upload para Supabase Storage e retorna URL assinada para download.
"""

import json
import yt_dlp
import os
import tempfile
from supabase import create_client, Client
from urllib.parse import urlparse

def main(req):
    try:
        # Parse request body
        if req.method != 'POST':
            return json.dumps({
                "error": "Método não permitido. Use POST."
            }), 405, {"Content-Type": "application/json"}
        
        body = req.json if hasattr(req, 'json') else {}
        video_url = body.get('video_url')
        media_id = body.get('media_id')
        
        # Se tiver media_id, buscar URL do banco
        if media_id and not video_url:
            # Buscar URL do banco usando Supabase client
            supabase_url = os.environ.get('SUPABASE_URL')
            supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
            
            if supabase_url and supabase_key:
                supabase: Client = create_client(supabase_url, supabase_key)
                media_data = supabase.table('media_library').select('video_url').eq('id', media_id).execute()
                
                if media_data.data:
                    video_url = media_data.data[0].get('video_url')
        
        if not video_url:
            return json.dumps({
                "error": "URL do vídeo ou media_id é obrigatório"
            }), 400, {"Content-Type": "application/json"}
        
        # Configurações do yt-dlp
        ydl_opts = {
            'format': 'best[ext=mp4]/best[height<=720]/best',  # Preferir MP4, máximo 720p
            'quiet': True,
            'no_warnings': True,
            'no_check_certificate': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
        
        # Criar diretório temporário
        with tempfile.TemporaryDirectory() as temp_dir:
            ydl_opts['outtmpl'] = os.path.join(temp_dir, '%(title)s.%(ext)s')
            
            # Baixar vídeo
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=True)
                
                # Encontrar arquivo baixado
                downloaded_file = ydl.prepare_filename(info)
                
                # Se não existir, procurar por qualquer arquivo no diretório
                if not os.path.exists(downloaded_file):
                    files = os.listdir(temp_dir)
                    if files:
                        downloaded_file = os.path.join(temp_dir, files[0])
                
                if not os.path.exists(downloaded_file):
                    return json.dumps({
                        "error": "Não foi possível baixar o vídeo."
                    }), 500, {"Content-Type": "application/json"}
                
                # Ler arquivo
                with open(downloaded_file, 'rb') as f:
                    video_data = f.read()
                
                # Upload para Supabase Storage
                supabase_url = os.environ.get('SUPABASE_URL')
                supabase_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
                
                if not supabase_url or not supabase_key:
                    return json.dumps({
                        "error": "Configuração do Supabase não encontrada"
                    }), 500, {"Content-Type": "application/json"}
                
                supabase: Client = create_client(supabase_url, supabase_key)
                
                # Nome do arquivo
                filename = os.path.basename(downloaded_file)
                # Sanitizar nome do arquivo
                filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '.')).strip()
                
                # Caminho no storage (organizar por data)
                from datetime import datetime
                date_path = datetime.now().strftime('%Y/%m/%d')
                storage_path = f"video-downloads/{date_path}/{filename}"
                
                # Upload
                storage_response = supabase.storage.from('media_uploads').upload(
                    storage_path,
                    video_data,
                    file_options={"content-type": "video/mp4"}
                )
                
                if storage_response.error:
                    return json.dumps({
                        "error": f"Erro ao fazer upload: {storage_response.error}"
                    }), 500, {"Content-Type": "application/json"}
                
                # Criar URL assinada (válida por 1 hora)
                signed_url_response = supabase.storage.from('media_uploads').create_signed_url(
                    storage_path,
                    3600  # 1 hora
                )
                
                if signed_url_response.error:
                    return json.dumps({
                        "error": "Erro ao criar URL assinada"
                    }), 500, {"Content-Type": "application/json"}
                
                return json.dumps({
                    "download_url": signed_url_response.data.get('signedURL'),
                    "filename": filename,
                    "size": len(video_data),
                }), 200, {"Content-Type": "application/json"}
        
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        if 'Private video' in error_msg:
            error_msg = "Este vídeo é privado e não pode ser baixado."
        elif 'Video unavailable' in error_msg:
            error_msg = "Este vídeo não está disponível."
        
        return json.dumps({
            "error": f"Erro ao baixar vídeo: {error_msg}"
        }), 400, {"Content-Type": "application/json"}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Erro ao processar download: {error_msg}")
        
        return json.dumps({
            "error": "Não foi possível baixar o vídeo. Tente novamente."
        }), 500, {"Content-Type": "application/json"}

