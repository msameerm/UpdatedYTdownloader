import json
import subprocess
import uuid
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

active_downloads = {}

# Define the cookie file path
COOKIE_FILE = 'cookies.txt'

def get_video_info(url):
    """Uses yt-dlp to fetch metadata, now WITH COOKIES."""
    command = [
        'yt-dlp',
        '--cookies', COOKIE_FILE,  # <-- ADD THIS LINE
        '--flat-playlist',
        '--dump-single-json',
        url
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=True, encoding='utf-8')
        data = json.loads(result.stdout)
        channel_info = {
            'name': data.get('uploader'),
            'avatar': data.get('thumbnails', [{}])[-1].get('url') if data.get('thumbnails') else None,
            'video_count': data.get('playlist_count'),
        }
        videos = data.get('entries', [])
        return {'channel': channel_info, 'videos': videos}
    except Exception as e:
        print(f"Error fetching video info: {e}")
        return {'error': 'Failed to fetch video data. Check URL or console for errors.'}

# ... (Your @app.route('/') and @app.route('/api/fetch') handlers remain the same) ...
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/fetch', methods=['POST'])
def fetch_videos():
    data = request.get_json()
    url = data.get('url')
    if not url:
        return jsonify({'error': 'URL is required.'}), 400
    video_info = get_video_info(url)
    if 'error' in video_info:
        return jsonify(video_info), 500
    return jsonify(video_info)


@app.route('/api/download', methods=['POST'])
def download_video():
    """Starts a download process, now WITH COOKIES."""
    data = request.get_json()
    video_id = data.get('videoId')
    if not video_id:
        return jsonify({'error': 'Video ID is required.'}), 400

    task_id = str(uuid.uuid4())
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    
    command = [
        'yt-dlp',
        '--cookies', COOKIE_FILE,  # <-- ADD THIS LINE
        '-f', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', f'%(title)s-{video_id}.%(ext)s',
        video_url
    ]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    active_downloads[task_id] = process
    
    print(f"Started download for {video_id}. Task ID: {task_id}")
    
    return jsonify({'message': 'Download started.', 'taskId': task_id})

# ... (Your @app.route('/api/cancel') handler remains the same) ...
@app.route('/api/cancel', methods=['POST'])
def cancel_download():
    data = request.get_json()
    task_id = data.get('taskId')
    if not task_id:
        return jsonify({'error': 'Task ID is required.'}), 400
    process = active_downloads.get(task_id)
    if process:
        try:
            process.terminate()
            process.wait()
            del active_downloads[task_id]
            print(f"Canceled and removed task ID: {task_id}")
            return jsonify({'message': 'Download canceled.'})
        except Exception as e:
            return jsonify({'error': f'Failed to terminate process: {e}'}), 500
    else:
        return jsonify({'error': 'Task not found or already completed.'}), 404


if __name__ == '__main__':
    app.run(debug=True)
