import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// --- 配置信息 (请替换为你自己的) ---
const SUPABASE_URL = 'https://akbhuoejgnfohicxhbyu.supabase.co/rest/v1/'
const SUPABASE_KEY = 'sb_publishable_etlyc-1dQyugr9OPl2QH5w_LjW6yei0'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snapBtn = document.getElementById('snap-btn');
const shutter = document.getElementById('shutter-overlay');
const slots = document.querySelectorAll('.photo-slot');

let photoCount = 0;

// 辅助函数：将 Canvas 导出的 Base64 转为 Blob 格式上传
function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

// 启动摄像头
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        video.srcObject = stream;
    } catch (err) {
        console.error("摄像头访问失败", err);
    }
}

// 拍照并上传
async function takePhoto() {
    // 1. 快门视觉动画
    shutter.classList.remove('flash-animation');
    void shutter.offsetWidth; 
    shutter.classList.add('flash-animation');

    // 2. 截图
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/png');

    // 3. 本地即时显示 (循环覆盖 6 个位子)
    const targetSlot = slots[photoCount % 6];
    targetSlot.innerHTML = `<img src="${imageData}">`;
    photoCount++;

    // 4. 上传到 Supabase 云端
    const fileName = `observation_${Date.now()}.png`;
    const blob = dataURLtoBlob(imageData);
    
    const { data, error } = await supabase.storage
        .from('photos')
        .upload(fileName, blob, { contentType: 'image/png' });

    if (error) console.error('云端上传失败:', error.message);
    else console.log('上传成功:', data);
}

snapBtn.addEventListener('click', takePhoto);
setupCamera();