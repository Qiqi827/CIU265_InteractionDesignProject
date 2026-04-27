function updateNewspaper() {
    const photoContainer = document.getElementById('newspaper-photos');
    const photos = JSON.parse(localStorage.getItem('capturedPhotos') || '[]');

    if (photos.length > 0) {
        photoContainer.innerHTML = '';
        photos.forEach((src, index) => {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'news-photo-wrapper';
            
            const img = document.createElement('img');
            img.src = src;
            
            // 报纸图片的说明文字
            const caption = document.createElement('p');
            caption.style.fontSize = '0.7rem';
            caption.style.marginTop = '5px';
            caption.innerText = `FIG. ${index + 1}: Observation från gatan.`;
            
            imgWrapper.appendChild(img);
            imgWrapper.appendChild(caption);
            photoContainer.appendChild(imgWrapper);
        });
    }
}

// 初始加载
updateNewspaper();

// 监听本地存储变化，或者定时刷新
window.addEventListener('storage', updateNewspaper);
setInterval(updateNewspaper, 3000); // 每3秒同步一次