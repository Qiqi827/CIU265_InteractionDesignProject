import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://akbhuoejgnfohicxhbyu.supabase.co/rest/v1/'
const SUPABASE_KEY = 'sb_publishable_etlyc-1dQyugr9OPl2QH5w_LjW6yei0'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function refreshNewspaper() {
    const container = document.getElementById('newspaper-photos');

    // 1. 获取最新 6 张照片（按创建时间排序）
    const { data, error } = await supabase.storage
        .from('photos')
        .list('', { limit: 6, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) return;

    container.innerHTML = '';
    data.forEach(file => {
        // 2. 获取每张图的公开链接
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(file.name);
        
        const imgWrapper = document.createElement('div');
        imgWrapper.className = 'news-photo-wrapper';
        imgWrapper.innerHTML = `
            <img src="${urlData.publicUrl}" style="filter: sepia(0.8) contrast(1.1) grayscale(0.3);">
            <p style="font-size:0.7rem; font-style:italic;">Obs: ${new Date(file.created_at).toLocaleTimeString()}</p>
        `;
        container.appendChild(imgWrapper);
    });
}

// 首次加载 + 每10秒同步一次
refreshNewspaper();
setInterval(refreshNewspaper, 1000);