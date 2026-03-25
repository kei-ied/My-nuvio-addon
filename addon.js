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
// 1. ملف manifest.json (تعريف الإضافة)
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
    idPrefixes: ['tt'] // نستخدم نفس النظام
  });
});

// =====================================================
// 2. دالة جلب قائمة المسلسلات (catalog)
// =====================================================
app.get('/catalog/:type/:id.json', async (req, res) => {
  try {
    // جلب صفحة "جميع المسلسلات" من الموقع
    const baseUrl = 'https://qeseh.net';
    const response = await axios.get(`${baseUrl}/%d8%ac%d9%85%d9%8a%d8%b9-%d8%a7%d9%84%d9%85%d8%b3%d9%84%d8%b3%d9%84%d8%a7%d8%aa/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    const seriesList = [];

    // استخراج المسلسلات من الصفحة (هذا selector مثال، قد تحتاج لتعديله)
    $('.post-item, .movie-item, .series-item').each((i, elem) => {
      const titleElem = $(elem).find('h3, .title, a');
      const linkElem = $(elem).find('a');
      const title = titleElem.text().trim();
      const link = linkElem.attr('href');
      
      if (title && link) {
        // نحاول استخراج معرف فريد من الرابط
        const idMatch = link.match(/\/series\/([^\/]+)/) || link.match(/\/\d+/);
        const seriesId = idMatch ? idMatch[1] : `qeseh_${i}`;
        
        seriesList.push({
          id: seriesId,
          name: title,
          poster: $(elem).find('img').attr('src') || '',
          description: `مسلسل تركي: ${title}`
        });
      }
    });

    // إذا لم نجد شيئاً، نضيف بعض الأمثلة
    if (seriesList.length === 0) {
      seriesList.push(
        { id: 'elhaset', name: 'مسلسل الحسد', poster: '', description: 'مسلسل تركي' },
        { id: 'akhi', name: 'مسلسل أخي', poster: '', description: 'مسلسل تركي' }
      );
    }

    res.json({ metas: seriesList });
  } catch (error) {
    console.error('خطأ في جلب المسلسلات:', error.message);
    // في حال الخطأ، نعيد قائمة تجريبية
    res.json({ 
      metas: [
        { id: 'example1', name: 'مسلسل تجريبي 1', poster: '', description: 'حدث خطأ في الجلب' }
      ]
    });
  }
});

// =====================================================
// 3. دالة جلب رابط المشاهدة (stream) للحلقة
// =====================================================
app.get('/stream/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  
  // نتوقع أن id يأتي بصيغة: "seriesName-season-episode" أو شيء مشابه
  // هنا نفترض أن المستخدم سيبحث عن المسلسل ثم يختار الحلقة
  
  try {
    // بناء رابط البحث في الموقع
    const searchUrl = `https://qeseh.net/?s=${encodeURIComponent(id)}`;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(response.data);
    
    // محاولة العثور على رابط الحلقة الأولى في نتائج البحث
    let videoUrl = null;
    
    // هذا selector يحتاج لتعديل حسب هيكل الموقع الفعلي
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      if (href && (href.includes('/watch/') || href.includes('/episode/'))) {
        videoUrl = href;
        return false; // break
      }
    });
    
    if (videoUrl) {
      // نعيد رابط الصفحة، وليس رابط الفيديو المباشر (لأن Nuvio سيفتحه في المتصفح الداخلي)
      return res.json({
        streams: [{
          title: 'مشاهدة على قصة عشق',
          url: videoUrl,
          behaviorHints: { notWebReady: true } // يفتح في المتصفح المدمج
        }]
      });
    } else {
      // رابط تجريبي للاختبار
      return res.json({
        streams: [{
          title: 'رابط تجريبي (عدّل الكود ليجلب رابطاً حقيقياً)',
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
