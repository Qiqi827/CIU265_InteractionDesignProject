const API_BASE_URL = 'http://10.159.67.31:8000';

async function refreshNewspaper() {
    const container = document.getElementById('newspaper-photos');

    const response = await fetch(`${API_BASE_URL}/api/photos/latest?limit=6`);
    if (!response.ok) return;
    const payload = await response.json();
    const items = payload.items || [];

    container.innerHTML = '';
    items.forEach((item) => {
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'news-photo-wrapper';
        imgWrapper.innerHTML = `
            <img src="data:image/png;base64,${item.image_base64}" style="filter: sepia(0.8) contrast(1.1) grayscale(0.3);">
            <p style="font-size:0.7rem; font-style:italic;">Captured: ${new Date(item.created_at).toLocaleTimeString()}</p>
        `;
        container.appendChild(imgWrapper);
    });
}

// Initial load + periodic sync
refreshNewspaper();
setInterval(refreshNewspaper, 1000);