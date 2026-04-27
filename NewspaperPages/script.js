const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const shutter = document.getElementById('shutter-overlay');
const slots = document.querySelectorAll('.photo-slot');

let photoCount = 0;

// 1. 获取摄像头权限
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
    } catch (err) {
        console.error("无法访问摄像头: ", err);
        alert("请确保已允许访问摄像头。");
    }
}

// 2. 拍照逻辑
function takePhoto() {
    // 快门动画
    shutter.classList.remove('flash-animation');
    void shutter.offsetWidth; // 触发重绘
    shutter.classList.add('flash-animation');

    // 绘制当前视频帧到画布
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 转换为图片
    const imageData = canvas.toDataURL('image/png');

    // 3. 更新右侧照片墙
    const currentSlotIndex = photoCount % 6;
    const targetSlot = slots[currentSlotIndex];

    // 清空现有内容并添加新图片
    targetSlot.innerHTML = '';
    const newImg = document.createElement('img');
    newImg.src = imageData;
    targetSlot.appendChild(newImg);

    photoCount++;
    
    // 获取已有的照片列表
    let photos = JSON.parse(localStorage.getItem('capturedPhotos') || '[]');
    // 将新照片插入到数组开头（模拟最新消息）
    photos.unshift(imageData); 
    // 只保留最近的6张，或者根据需要保留更多
    if(photos.length > 12) photos.pop();
    localStorage.setItem('capturedPhotos', JSON.stringify(photos));
}

snapBtn.addEventListener('click', takePhoto);

// 初始化
setupCamera();