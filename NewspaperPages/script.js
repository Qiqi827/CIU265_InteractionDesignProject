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

// 5. 核心拍照函数
async function takePhoto() {
    // --- 视觉效果：快门闪烁 ---
    shutter.classList.remove('flash-animation');
    void shutter.offsetWidth; // 强制重绘
    shutter.classList.add('flash-animation');

    // --- 图像捕捉：绘制到 Canvas ---
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 导出图片数据 (Base64)
    const imageData = canvas.toDataURL('image/png');

    // --- 本地反馈：更新右侧照片墙 ---
    const currentSlotIndex = photoCount % 6;
    const targetSlot = slots[currentSlotIndex];

    targetSlot.innerHTML = '';
    const newImg = document.createElement('img');
    newImg.src = imageData;
    // 这里的 CSS 已经处理了泛黄滤镜
    targetSlot.appendChild(newImg);

    photoCount++;

    // --- 云端同步：异步上传 ---
    // 我们不需要等待上传完成才允许下一次拍照，所以不加 await
    uploadToCloud(imageData);
}

// 绑定按钮事件
snapBtn.addEventListener('click', takePhoto);

// 初始化摄像头
setupCamera();