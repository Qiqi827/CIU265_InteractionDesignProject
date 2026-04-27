// 1. 引入 Firebase 必要的功能模块
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getStorage, ref, listAll, getDownloadURL, getMetadata } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// 2. Firebase 配置 (请替换为你自己的 Firebase 项目参数)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};

// 3. 初始化 Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const photoContainer = document.getElementById('newspaper-photos');

// 4. 从云端加载并渲染照片的主函数
async function loadCloudPhotos() {
    console.log("正在同步云端报纸内容...");
    const listRef = ref(storage, 'photos/');

    try {
        // 获取文件夹下的所有文件引用
        const res = await listAll(listRef);
        
        // 获取每个文件的下载链接及其元数据（用于排序）
        const fetchPromises = res.items.map(async (item) => {
            const [url, metadata] = await Promise.all([
                getDownloadURL(item),
                getMetadata(item)
            ]);
            return { url, time: metadata.timeCreated };
        });

        const photoData = await Promise.all(fetchPromises);

        // 按上传时间从新到旧排序
        photoData.sort((a, b) => new Date(b.time) - new Date(a.time));

        // 只取最新的 6 张照片进行排版
        const latestPhotos = photoData.slice(0, 6);

        // 清空现有占位符
        photoContainer.innerHTML = '';

        // 动态生成报纸照片 HTML
        latestPhotos.forEach((data, index) => {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'news-photo-wrapper';
            
            // 每一个照片位的小动画（可选）
            imgWrapper.style.animation = `fadeIn 0.5s ease forwards ${index * 0.2}s`;
            imgWrapper.style.opacity = '0';

            const img = document.createElement('img');
            img.src = data.url;
            img.alt = "Gatuobservation";

            const caption = document.createElement('p');
            caption.className = 'photo-caption';
            caption.style.fontSize = '0.7rem';
            caption.style.marginTop = '5px';
            caption.style.fontStyle = 'italic';
            
            // 瑞典语图注：显示拍摄的时间戳（简化版）
            const photoDate = new Date(data.time).toLocaleTimeString('sv-SE', {hour: '2-digit', minute:'2-digit'});
            caption.innerText = `FIG. ${index + 1}: Observation kl ${photoDate}.`;

            imgWrapper.appendChild(img);
            imgWrapper.appendChild(caption);
            photoContainer.appendChild(imgWrapper);
        });

        if (latestPhotos.length === 0) {
            photoContainer.innerHTML = '<div class="empty-slot">Väntar på senaste nytt...</div>';
        }

    } catch (error) {
        console.error("云端照片加载失败:", error);
        photoContainer.innerHTML = '<div class="empty-slot">Kunde inte hämta bilder.</div>';
    }
}

// 5. 初始化执行
loadCloudPhotos();

// 6. 轮询机制：每 10 秒钟自动刷新一次报纸页面，实现跨设备“直播”效果
setInterval(loadCloudPhotos, 10000);