"""
Edge Function: get-video-metadata
Usa yt-dlp para extrair metadados de vídeos do YouTube, Instagram, etc.
"""

import json
import yt_dlp
import os
from datetime import timedelta

def main(req):
    try:
        # Parse request body
        if req.method != 'POST':
            return json.dumps({
                "error": "Método não permitido. Use POST."
            }), 405, {"Content-Type": "application/json"}
        
        body = req.json if hasattr(req, 'json') else {}
        video_url = body.get('video_url')
        
        if not video_url:
            return json.dumps({
                "error": "URL do vídeo é obrigatória"
            }), 400, {"Content-Type": "application/json"}
        
        # Configurações do yt-dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False,
            'no_check_certificate': True,
            'prefer_insecure': False,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
        
        # Extrair informações do vídeo
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            
            # Formatar duração
            duration = info.get('duration', 0)
            duration_string = str(timedelta(seconds=duration)) if duration else '0:00'
            # Remove horas se for 0
            if duration_string.startswith('0:'):
                duration_string = duration_string[2:]
            
            # Buscar melhor thumbnail disponível
            thumbnails = info.get('thumbnails', [])
            thumbnail = info.get('thumbnail', '')
            if thumbnails:
                # Preferir thumbnails de maior qualidade
                thumbnail = thumbnails[-1].get('url', thumbnail) if thumbnails else thumbnail
            
            # Preparar resposta
            response_data = {
                "title": info.get('title', 'Sem título'),
                "thumbnail": thumbnail,
                "uploader": info.get('uploader') or info.get('channel') or info.get('creator') or 'Desconhecido',
                "duration": duration,
                "duration_string": duration_string,
                "description": info.get('description', '')[:500],  # Limitar tamanho
                "view_count": info.get('view_count', 0),
                "video_url": video_url,
                "platform": "youtube" if "youtube" in video_url or "youtu.be" in video_url else "instagram" if "instagram" in video_url else "other",
            }
            
            return json.dumps(response_data), 200, {"Content-Type": "application/json"}
            
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e)
        # Mensagens de erro mais amigáveis
        if 'Private video' in error_msg or 'Sign in' in error_msg:
            error_msg = "Este vídeo é privado ou requer login. Não é possível acessá-lo."
        elif 'Video unavailable' in error_msg or 'unavailable' in error_msg.lower():
            error_msg = "Este vídeo não está disponível ou foi removido."
        elif 'region' in error_msg.lower() or 'country' in error_msg.lower():
            error_msg = "Este vídeo não está disponível na sua região."
        
        return json.dumps({
            "error": f"Não foi possível obter os metadados do vídeo. {error_msg}"
        }), 400, {"Content-Type": "application/json"}
        
    except Exception as e:
        error_msg = str(e)
        print(f"Erro ao processar vídeo: {error_msg}")
        
        return json.dumps({
            "error": "Não foi possível obter os metadados do vídeo. Verifique a URL ou tente novamente."
        }), 500, {"Content-Type": "application/json"}

