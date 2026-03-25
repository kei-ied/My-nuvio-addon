const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// =====================================================
// 1. manifest.json
// =====================================================
app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.qeseh.addon',
    version: '1.0.1',
    name: 'قصة عشق - مسلسلات تركية',
    description: 'مشاهدة المسلسلات التركية المترجمة',
    resources: ['catalog', 'stream'],
    types: ['series'],
    catalogs: [
      {
        type: 'series',
        id: 'qeseh_series',
        name: 'مسلسلات تركية (قصة عشق)',
        extra: [{ name: 'search', isRequired: false }]
      }
    ],
    idPrefixes: ['tt']
  });
});

// =====================================================
// 2. دالة مساعدة لجلب الصفحة مع تجربة عدة بروكسيات
// =====================================================
async function fetchHTML(url) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  
  // المحاولة 1: مباشرة
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': userAgent },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.log('Direct fetch failed, trying proxy...');
  }
  
  // المحاولة 2: باستخدام corsproxy.io
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    const response = await axios.get(proxyUrl, {
      headers: { 'User-Agent': userAgent },
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.log('corsproxy.io failed, trying allorigins...');
  }
  
  // المحاولة 3: باستخدام allorigins
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const response = await axios.get(proxyUrl, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    console.log('All proxies failed');
    throw new Error('Unable to fetch page');
  }
}

// =====================================================
// 3. جلب قائمة المسلسلات (catalog)
// =====================================================
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    const targetUrl = 'https://qeseh.net/%d8%ac%d9%85%d9%8a%d8%b9-%d8%a7%d9%84%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/';
    const html = await fetchHTML(targetUrl);
    const $ = cheerio.load(html);
    
    const seriesList = [];
    
    // قائمة موسعة من المحددات المحتملة (جربها كلها)
    const selectors = [
      '.post-item', '.movie-item', '.series-item', 
      '.post', '.item', '.seri', 'article',
      '.result-item', '.box-item', '.movie',
      'div[class*="post"]', 'div[class*="movie"]'
    ];
    
    let found = false;
    for (const selector of selectors) {
      $(selector).each((i, elem) => {
        const linkElem = $(elem).find('a');
        let link = linkElem.attr('href');
        let title = $(elem).find('h3, .title, a').first().text().trim();
        
        if (!title && link) {
          title = link.split('/').filter(Boolean).pop() || '';
        }
        
        if (link && title) {
          const idMatch = link.match(/\/([^\/]+)\/?$/);
          const seriesId = idMatch ? idMatch[1] : `s_${i}`;
          const poster = $(elem).find('img').attr('src') || '';
          
          seriesList.push({
            id: seriesId,
            name: title.substring(0, 80),
            poster: poster,
            description: `مسلسل تركي: ${title}`
          });
        }
      });
      
      if (seriesList.length > 0) {
        found = true;
        break;
      }
    }
    
    if (!found || seriesList.length === 0) {
      // لا توجد نتائج، نعيد قائمة يدوية (يمكن تعديلها)
      seriesList.push(
        { id: 'elhaset', name: 'الحسد', poster: '', description: 'مسلسل تركي' },
        { id: 'akhi', name: 'أخي', poster: '', description: 'مسلسل تركي' },
        { id: 'medine', name: 'المدينة البعيدة', poster: '', description: 'مسلسل تركي' }
      );
    }
    
    res.json({ metas: seriesList.slice(0, 50) });
    
  } catch (error) {
    console.error('Error in catalog:', error.message);
    // نعيد قائمة احتياطية ثابتة
    res.json({
      metas: [
        { id: 'fallback1', name: 'حدث خطأ في الاتصال (استخدم الإضافة الجاهزة)', poster: '', description: 'جرّب إضافة Turkish Series الجاهزة' },
        { id: 'fallback2', name: 'الحسد', poster: '', description: 'مسلسل تركي' }
      ]
    });
  }
});

// =====================================================
// 4. جلب رابط المشاهدة (stream)
// =====================================================
app.get('/stream/:type/:id.json', async (req, { id } = req.params) => {
  try {
    const searchUrl = `https://qeseh.net/?s=${encodeURIComponent(id)}`;
    const html = await fetchHTML(searchUrl);
    const $ = cheerio.load(html);
    
    let episodeUrl = null;
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && (href.includes('/episode/') || href.includes('/watch/') || /\/\d+$/.test(href))) {
        episodeUrl = href;
        return false;
      }
    });
    
    if (episodeUrl) {
      return res.json({
        streams: [{
          title: 'مشاهدة على قصة عشق',
          url: episodeUrl,
          behaviorHints: { notWebReady: true }
        }]
      });
    } else {
      return res.json({ streams: [] });
    }
  } catch (error) {
    console.error('Error in stream:', error.message);
    res.json({ streams: [] });
  }
});

// =====================================================
// تشغيل محلي (اختياري)
// =====================================================
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}

module.exports = app;
