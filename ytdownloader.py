import os
import json
import re
import subprocess
import yt_dlp

def get_video_list_with_channel_info(url):
    ydl_opts = {'quiet': True, 'extract_flat': 'in_playlist', 'force_generic_extractor': True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        
        channel_info = {
            "name": info.get("uploader", info.get("channel", "N/A")),
            "url": info.get("uploader_url", info.get("channel_url", "#")),
            "thumbnail": info.get("channel_thumbnail_url", "https://via.placeholder.com/80"),
            "video_count": info.get("playlist_count", len(info.get("entries", []))),
            "subscriber_count": info.get("channel_follower_count_text", "N/A")
        }
        
        videos_to_process = info.get('entries', [info if 'entries' not in info else None])
        detailed_videos = []

        for video in videos_to_process:
             if not video: continue
             detailed_videos.append({
                 'id': video.get('id'),
                 'title': video.get('title'),
                 'thumbnails': [{'url': f"https://i.ytimg.com/vi/{video.get('id')}/mqdefault.jpg"}],
                 'view_count': video.get('view_count'),
                 'upload_date': 'N/A', 
             })
        return channel_info, detailed_videos


def stream_download(video_id, quality):
    video_url = f"https://www.youtube.com/watch?v={video_id}"

    format_map = {
        "1080p": 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        "720p": 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        "mp3": 'bestaudio/best'
    }
    
    # Command to run yt-dlp as a separate process
    command = [
        'yt-dlp',
        '--progress',          # Make sure progress is reported
        '--newline',           # Print progress on new lines
        '-f', format_map.get(quality, 'best'),
        '-o', 'downloads/%(title)s - %(id)s.%(ext)s',
        video_url
    ]

    # Add post-processing for MP3
    if quality == 'mp3':
        command.extend(['-x', '--audio-format', 'mp3'])

    # Use subprocess.Popen to run the command and capture output in real-time
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')

    try:
        # Read the output line by line as it's generated
        for line in process.stdout:
            # Use a regular expression to find lines containing download progress
            progress_match = re.search(r'\[download\]\s+([\d\.]+)%\s+of\s+~\s*([\d\.]+[KMG]?i?B)', line)
            
            if progress_match:
                percent = float(progress_match.group(1))
                size_str = progress_match.group(2)
                
                progress_data = {
                    "status": "progress",
                    "percent": percent,
                    "size_str": size_str
                }
                yield f"data: {json.dumps(progress_data)}\n\n"

        # Check for errors after the process finishes
        process.wait()
        if process.returncode != 0:
            error_output = process.stderr.read()
            raise Exception(f"Download failed: {error_output}")

        yield f"data: {json.dumps({'status': 'finished', 'message': 'Download complete'})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
    finally:
        # Ensure the process is terminated if something goes wrong
        if process.poll() is None:
            process.terminate()

# Helper functions (no changes needed)
def save_downloaded_id(video_id, filename='downloaded_ids.txt'):
    # ...
    pass

def load_downloaded_ids(filename='downloaded_ids.txt'):
    # ...
    pass