document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    const AppState = {
        fetchedVideos: [],
        downloadQueue: [],
        isDownloading: false,
        currentPlaylistUrl: '',
        activeEventSource: null,
    };

    // --- DOM Element Cache ---
    const UI = {
        heroSection: document.getElementById('hero-section'),
        fetchForm: document.getElementById('fetch-form'),
        urlInput: document.getElementById('url-input'),
        fetchButton: document.getElementById('fetch-button'),
        fetchBtnText: document.getElementById('fetch-btn-text'),
        fetchSpinner: document.getElementById('fetch-spinner'),
        contentSection: document.getElementById('content-section'),
        downloadDock: document.getElementById('download-dock'),
        currentTaskText: document.getElementById('current-task-text'),
        currentTaskProgress: document.getElementById('current-task-progress'),
        currentTaskStatus: document.getElementById('current-task-status'),
        stopAllBtn: document.getElementById('stop-all-btn'),
    };

    // --- Event Listeners ---
    UI.fetchForm.addEventListener('submit', handleFetch);
    UI.stopAllBtn.addEventListener('click', stopAllDownloads);

    // --- Core Functions ---

    async function handleFetch(e) {
        e.preventDefault();
        const url = UI.urlInput.value.trim();
        if (!url) return;
        AppState.currentPlaylistUrl = url;
        setFetchButtonState(true, 'Fetching...');

        try {
            const response = await fetch('/api/fetch-videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            AppState.fetchedVideos = data.videos;
            renderContent(data.channel, data.videos);
            UI.heroSection.classList.add('d-none');
            UI.contentSection.classList.remove('d-none');
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            setFetchButtonState(false, 'Fetch Content');
        }
    }

    function renderContent(channel, videos) {
        UI.contentSection.innerHTML = `
            <div class="card glass-card p-3 d-flex flex-row align-items-center gap-4 mb-4">
                <img src="${channel.thumbnail}" class="rounded-circle" width="80" alt="Avatar">
                <div class="flex-grow-1">
                    <a href="${channel.url}" target="_blank" class="text-decoration-none"><h4 class="fw-bold mb-1">${channel.name}</h4></a>
                    <p class="text-muted small mb-0">${channel.subscriber_count} | ${channel.video_count} videos</p>
                </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" id="select-all-checkbox" checked>
                    <label class="form-check-label" for="select-all-checkbox">Select All (${videos.length})</label>
                </div>
                <button id="bulk-download-btn" class="btn btn-success btn-lg"><i class="bi bi-download"></i> Download Selected</button>
            </div>
            <div id="video-grid" class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4"></div>`;
        
        const grid = document.getElementById('video-grid');
        videos.forEach(video => {
            const thumbnail = video.thumbnails[video.thumbnails.length - 1].url;
            grid.insertAdjacentHTML('beforeend', `
                <div class="col">
                    <div class="card video-card h-100" id="card-${video.id}">
                        <img src="${thumbnail}" class="card-img-top">
                        <div class="card-body">
                            <p class="card-title fw-bold text-light">${video.title}</p>
                            <small class="text-muted">${(video.view_count || 0).toLocaleString()} views | ${video.upload_date}</small>
                            <div class="progress video-progress mt-2" id="progress-container-${video.id}" style="display: none;">
                                <div class="progress-bar" id="progress-bar-${video.id}" style="width: 0%;">0%</div>
                            </div>
                            <small class="text-muted" id="progress-text-${video.id}"></small>
                        </div>
                        <div class="card-footer d-flex justify-content-between align-items-center">
                            <div class="form-check">
                                <input class="form-check-input video-checkbox" type="checkbox" value="${video.id}" checked>
                            </div>
                            <div class="btn-group" id="controls-${video.id}">
                                <select class="form-select form-select-sm quality-selector" style="width: auto;">
                                    <option value="1080p">1080p</option><option value="720p">720p</option><option value="mp3">MP3</option>
                                </select>
                                <button class="btn btn-sm btn-outline-primary download-btn" data-video-id="${video.id}"><i class="bi bi-download"></i></button>
                            </div>
                        </div>
                    </div>
                </div>`);
        });

        // Add event listeners to newly created elements
        document.getElementById('select-all-checkbox').addEventListener('change', e => 
            document.querySelectorAll('.video-checkbox').forEach(cb => cb.checked = e.target.checked));
        
        document.getElementById('bulk-download-btn').addEventListener('click', handleBulkDownload);
        
        document.querySelectorAll('.download-btn').forEach(btn => 
            btn.addEventListener('click', () => handleSingleDownload(btn.dataset.videoId)));
    }
    
    // --- Download Management ---

    function handleSingleDownload(videoId) {
        if (AppState.isDownloading) return alert('A download is already in progress. Please wait.');
        const video = AppState.fetchedVideos.find(v => v.id === videoId);
        const quality = document.querySelector(`#card-${videoId} .quality-selector`).value;
        AppState.downloadQueue = [{...video, quality}];
        processQueue();
    }

    function handleBulkDownload() {
        if (AppState.isDownloading) return alert('A download is already in progress. Please wait.');
        const selectedIds = new Set(Array.from(document.querySelectorAll('.video-checkbox:checked')).map(cb => cb.value));
        const quality = document.querySelector('.quality-selector').value; // Use first one as global
        AppState.downloadQueue = AppState.fetchedVideos
            .filter(v => selectedIds.has(v.id))
            .map(v => ({...v, quality}));
        processQueue();
    }

    function processQueue() {
        if (AppState.downloadQueue.length === 0) {
            AppState.isDownloading = false;
            UI.downloadDock.classList.remove('show');
            return;
        }

        AppState.isDownloading = true;
        UI.downloadDock.classList.add('show');
        
        const video = AppState.downloadQueue.shift(); // Get the next video
        startDownload(video);
    }
    
    function startDownload(video) {
        const { id, quality, title } = video;
        const eventSource = new EventSource(`/api/download/stream?video_id=${id}&quality=${quality}`);
        AppState.activeEventSource = eventSource;

        updateCardToDownloading(id, title);

        eventSource.onmessage = e => {
            const data = JSON.parse(e.data);
            if (data.status === 'progress') {
                updateProgress(id, data.percent, data.size_str);
            } else if (['finished', 'error', 'skipped'].includes(data.status)) {
                eventSource.close();
                AppState.activeEventSource = null;
                updateCardToFinished(id, data.status, data.message);
                processQueue(); // Start the next download
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            AppState.activeEventSource = null;
            updateCardToFinished(id, 'error', 'Connection lost');
            processQueue(); // Try to start the next download
        };
    }

    function stopAllDownloads() {
        if (AppState.activeEventSource) {
            AppState.activeEventSource.close();
            AppState.activeEventSource = null;
        }
        const currentVideo = AppState.downloadQueue.length > 0 ? AppState.downloadQueue[0] : null;
        if(currentVideo) updateCardToFinished(currentVideo.id, 'error', 'Cancelled');

        AppState.downloadQueue = [];
        AppState.isDownloading = false;
        UI.downloadDock.classList.remove('show');
    }
    
    // --- UI Update Functions ---
    
    function updateProgress(videoId, percent, sizeStr) {
        const progressBar = document.getElementById(`progress-bar-${videoId}`);
        const progressText = document.getElementById(`progress-text-${videoId}`);
        if(progressBar) {
            progressBar.style.width = `${percent}%`;
            progressBar.textContent = `${Math.round(percent)}%`;
        }
        if(progressText) progressText.textContent = sizeStr;

        // Update main dock
        UI.currentTaskProgress.style.width = `${percent}%`;
        UI.currentTaskStatus.textContent = `${sizeStr} (${Math.round(percent)}%)`;
    }

    function updateCardToDownloading(videoId, title) {
        document.getElementById(`progress-container-${videoId}`).style.display = 'flex';
        const controls = document.getElementById(`controls-${videoId}`);
        controls.innerHTML = `<span class="badge bg-info">Downloading...</span>`;
        UI.currentTaskText.textContent = `Downloading: ${title}`;
    }

    function updateCardToFinished(videoId, status, message) {
        document.getElementById(`progress-text-${videoId}`).textContent = message;
        const controls = document.getElementById(`controls-${videoId}`);
        const statusMap = {'finished': 'success', 'error': 'danger', 'skipped': 'warning'};
        controls.innerHTML = `<span class="badge bg-${statusMap[status]}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
    }

    function setFetchButtonState(isLoading, text) {
        UI.fetchButton.disabled = isLoading;
        UI.fetchSpinner.classList.toggle('d-none', !isLoading);
        UI.fetchBtnText.textContent = text;
    }
});