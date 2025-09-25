document.addEventListener('DOMContentLoaded', () => {
    // ===================================
    //  1. Element References
    // ===================================
    const fetchBtn = document.getElementById('fetch-btn');
    const urlInput = document.getElementById('youtube-url');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');
    const contentDisplay = document.getElementById('content-display');
    const channelOverview = document.getElementById('channel-overview');
    const videoGrid = document.getElementById('video-grid');
    const downloadManager = document.getElementById('download-manager');
    const dockContent = document.querySelector('.dock-content');

    // ===================================
    //  2. Event Listeners
    // ===================================
    fetchBtn.addEventListener('click', handleFetch);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleFetch();
    });

    // Event delegation for dynamically added buttons
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('download-btn')) {
            const videoId = e.target.dataset.videoId;
            const videoTitle = e.target.closest('.video-info').querySelector('h5').textContent;
            startDownload(videoId, videoTitle);
        }
        if (e.target.classList.contains('cancel-btn')) {
            const taskId = e.target.dataset.taskId;
            cancelDownload(taskId);
        }
    });

    // ===================================
    //  3. Core Functions
    // ===================================
    async function handleFetch() {
        const url = urlInput.value.trim();

        // --- URL VALIDATION BLOCK ---
        const youtubeUrlPattern = /^(https|http):\/\/((www|music)\.)?youtube\.com\/.+/;
        if (!url || !youtubeUrlPattern.test(url)) {
            showError('Please enter a valid YouTube URL (e.g., https://www.youtube.com/@channelname)');
            return;
        }

        // Show loader and reset UI
        loader.style.display = 'block';
        contentDisplay.style.display = 'none';
        errorMessage.textContent = '';
        channelOverview.innerHTML = '';
        videoGrid.innerHTML = '';

        try {
            const response = await fetch('/api/fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'An unknown error occurred.');
            displayContent(data);
        } catch (error) {
            showError(error.message);
        } finally {
            loader.style.display = 'none';
        }
    }

    function displayContent(data) {
        // Display Channel Info
        const channel = data.channel;
        channelOverview.innerHTML = `
            <h2>Channel Overview</h2>
            <div class="channel-card">
                <img src="${channel.avatar || 'https://via.placeholder.com/100'}" alt="Channel Avatar" class="channel-avatar">
                <div class="channel-info">
                    <h3>${channel.name || 'Unknown Channel'}</h3>
                    <p>${channel.video_count || 'N/A'} videos</p>
                </div>
            </div>
        `;

        // Display Video Grid with download buttons
        videoGrid.innerHTML = ''; // Clear previous results
        const videos = data.videos;
        if (videos && videos.length > 0) {
            videos.forEach(video => {
                const col = document.createElement('div');
                col.className = 'col-lg-3 col-md-4 col-sm-6';
                const thumbnail = video.thumbnails ? video.thumbnails[video.thumbnails.length - 1].url : 'https://via.placeholder.com/320x180';
                col.innerHTML = `
                    <div class="video-card">
                        <img src="${thumbnail}" alt="Video Thumbnail">
                        <div class="video-info">
                            <h5>${video.title}</h5>
                            <div class="video-meta">
                                <span>Duration: ${formatDuration(video.duration)}</span>
                            </div>
                            <button class="download-btn" data-video-id="${video.id}">Start Download</button>
                        </div>
                    </div>
                `;
                videoGrid.appendChild(col);
            });
        } else {
            videoGrid.innerHTML = '<p class="text-center">No videos found.</p>';
        }
        contentDisplay.style.display = 'block';
    }

    // ===================================
    //  4. Download Management Functions
    // ===================================
    async function startDownload(videoId, videoTitle) {
        console.log(`Starting download for ID: ${videoId}`);
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId: videoId }),
            });
            const data = await response.json();
            if (response.ok) {
                addDownloadToManager(data.taskId, videoTitle);
            } else {
                showError(data.error || 'Failed to start download.');
            }
        } catch (err) {
            showError('A network error occurred while trying to start the download.');
        }
    }

    async function cancelDownload(taskId) {
        console.log(`Canceling download for Task ID: ${taskId}`);
        try {
            const response = await fetch('/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: taskId }),
            });
            const data = await response.json();
            if (response.ok) {
                removeDownloadFromManager(taskId);
            } else {
                showError(data.error || 'Failed to cancel download.');
            }
        } catch (err) {
            showError('A network error occurred while trying to cancel the download.');
        }
    }

    function addDownloadToManager(taskId, videoTitle) {
        // Show the manager if it's the first download
        if (!downloadManager.classList.contains('active')) {
            downloadManager.classList.add('active');
            dockContent.innerHTML = '<h4>Active Downloads</h4>';
        }

        const downloadItem = document.createElement('div');
        downloadItem.className = 'download-item';
        downloadItem.id = `task-${taskId}`;
        downloadItem.innerHTML = `
            <p title="${videoTitle}">Downloading: ${videoTitle}</p>
            <button class="cancel-btn" data-task-id="${taskId}">Cancel</button>
        `;
        dockContent.appendChild(downloadItem);
    }

    function removeDownloadFromManager(taskId) {
        const itemToRemove = document.getElementById(`task-${taskId}`);
        if (itemToRemove) {
            itemToRemove.remove();
        }

        // Hide the manager if no downloads are left
        const remainingItems = dockContent.querySelectorAll('.download-item');
        if (remainingItems.length === 0) {
            downloadManager.classList.remove('active');
            dockContent.innerHTML = ''; // Clear the "Active Downloads" header
        }
    }

    // ===================================
    //  5. Utility Functions
    // ===================================
    function showError(message) {
        errorMessage.textContent = message;
    }

    function formatDuration(seconds) {
        if (!seconds) return 'N/A';
        return new Date(seconds * 1000).toISOString().substr(11, 8);
    }
});
