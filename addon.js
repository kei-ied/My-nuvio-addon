const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();

// منع مشكلة CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// =====================================================
// 1. ملف manifest.json
// =====================================================
app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'org.qeseh.addon',
    version: '1.0.0',
    name: 'قصة عشق - مسلسلات تركية',
    description: 'مشاهدة المسلسلات التركية المترجمة من موقع قصة عشق',
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
// 2. جلب قائمة المسلسلات (catalog)
// =====================================================
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    // نستخدم وكيل CORS لتجاوز منع الموقع
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = 'https://qeseh.net/%d8%ac%d9%85%d9%8a%d8%b9-%d8%a7%d9%84%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/';
    const response = await axios.get(proxyUrl + encodeURIComponent(targetUrl), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const seriesList = [];

    // قائمة بمحددات (selectors) محتملة – تجربة تلقائية
    const possibleSelectors = [
      '.post-item', '.movie-item', '.series-item', 
      '.post', '.movie', '.item', '.seri',
      'article', '.box-item', '.result-item'
    ];

    let found = false;
    for (const selector of possibleSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        elements.each((i, elem) => {
          const titleElem = $(elem).find('h3, .title, a, h2');
          const linkElem = $(elem).find('a');
          let title = titleElem.text().trim();
          let link = linkElem.attr('href');
          const poster = $(elem).find('img').attr('src');

          if (!title && link) title = link.split('/').pop() || '';
          if (title && link) {
            const idMatch = link.match(/\/([^\/]+)\/?$/);
            const seriesId = idMatch ? idMatch[1] : `s_${i}`;
            seriesList.push({
              id: seriesId,
              name: title.length > 60 ? title.slice(0, 60) : title,
              poster: poster || '',
              description: `مسلسل تركي: ${title}`
            });
          }
        });
        if (seriesList.length > 0) {
          found = true;
          break;
        }
      }
    }

    // إذا لم نجد شيئاً، نستخدم قائمة احتياطية ثابتة
    if (!found || seriesList.length === 0) {
      seriesList.push(
        { id: 'elhaset', name: 'الحسد', poster: '', description: 'مسلسل تركي' },
        { id: 'akhi', name: 'أخي', poster: '', description: 'مسلسل تركي' },
        { id: 'medine', name: 'المدينة البعيدة', poster: '', description: 'مسلسل تركي' }
      );
    }

    res.json({ metas: seriesList.slice(0, 50) }); // نحد العدد
  } catch (error) {
    console.error('خطأ في جلب المسلسلات:', error.message);
    // نعيد قائمة احتياطية في حال الخطأ
    res.json({
      metas: [
        { id: 'error1', name: 'حدث خطأ في الاتصال', poster: '', description: 'تأكد من اتصالك بالإنترنت' },
        { id: 'example', name: 'مسلسل تجريبي', poster: '', description: 'جرّب تحديث الإضافة لاحقاً' }
      ]
    });
  }
});

// =====================================================
// 3. جلب رابط المشاهدة (stream) – تجربة بحث
// =====================================================
app.get('/stream/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  try {
    // نبحث عن المسلسل في الموقع
    const searchUrl = `https://qeseh.net/?s=${encodeURIComponent(id)}`;
    const proxyUrl = 'https://corsproxy.io/?';
    const response = await axios.get(proxyUrl + encodeURIComponent(searchUrl), {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);
    let episodeUrl = null;

    // نبحث عن أول رابط للحلقات
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && (href.includes('/episode/') || href.includes('/watch/') || href.match(/\/\d+$/))) {
        episodeUrl = href;
        return false; // break
      }
    });

    if (episodeUrl) {
      // نعيد رابط الصفحة (Nuvio سيفتحها في متصفحه الداخلي)
      return res.json({
        streams: [{
          title: 'مشاهدة على قصة عشق',
          url: episodeUrl,
          behaviorHints: { notWebReady: true }
        }]
      });
    } else {
      // رابط تجريبي للإشارة
      return res.json({
        streams: [{
          title: 'لم نعثر على حلقة (رابط تجريبي)',
          url: 'https://example.com/video.mp4',
          behaviorHints: { notWebReady: true }
        }]
      });
    }
  } catch (error) {
    console.error('خطأ في جلب الرابط:', error.message);
    res.json({ streams: [] });
  }
});

// =====================================================
// تشغيل محلي (للتطوير)
// =====================================================
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`إضافة قصة عشق تعمل على: http://localhost:${port}/manifest.json`);
  });
}

module.exports = app;
