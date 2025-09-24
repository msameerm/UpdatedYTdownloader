import os
import json
from flask import Flask, render_template, request, Response, jsonify
from ytdownloader import get_video_list_with_channel_info, stream_download

app = Flask(__name__)
if not os.path.exists('downloads'):
    os.makedirs('downloads')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/fetch-videos', methods=['POST'])
def fetch_videos():
    url = request.json.get('url')
    if not url:
        return jsonify({"error": "URL is required"}), 400
    try:
        channel_info, videos = get_video_list_with_channel_info(url)
        return jsonify({"channel": channel_info, "videos": videos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/download/stream')
def download_stream():
    video_id = request.args.get('video_id')
    quality = request.args.get('quality', '1080p')
    if not video_id:
        return Response("Missing video_id", status=400)
    
    # This directly returns the generator from stream_download
    return Response(stream_download(video_id, quality), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True, threaded=True)