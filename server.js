import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());

// In-memory LRU-like micro cache for resized images (saves bandwidth and CPU)
const imageCache = new Map();
const MAX_CACHE_SIZE = 500;

// Fast Proxy endpoint with Sharp image downscaling & compression
app.get('/api/proxy', async (req, res) => {
  const { url, width } = req.query;

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid or missing "url" query parameter' });
  }

  const cacheKey = `${url}_w${width || 'orig'}`;
  if (imageCache.has(cacheKey)) {
    const cached = imageCache.get(cacheKey);
    res.setHeader('Content-Type', cached.contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(cached.buffer);
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream returned ${response.status}` });
    }

    const rawBuffer = Buffer.from(await response.arrayBuffer());

    // Downscale for fast AI face recognition if width is requested (default ~360px)
    if (width && !isNaN(parseInt(width))) {
      const targetWidth = Math.min(800, Math.max(160, parseInt(width)));
      try {
        const resized = await sharp(rawBuffer)
          .resize({ width: targetWidth, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();

        if (imageCache.size >= MAX_CACHE_SIZE) {
          const firstKey = imageCache.keys().next().value;
          imageCache.delete(firstKey);
        }
        imageCache.set(cacheKey, { buffer: resized, contentType: 'image/jpeg' });

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(resized);
      } catch (resizeErr) {
        // Fallback to raw buffer
      }
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(rawBuffer);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch resource' });
  }
});

// GoTag.me — fetch event page and extract image URLs
app.get('/api/gotag/photos', async (req, res) => {
  const { eventSlug, page = 1 } = req.query;

  if (!eventSlug) {
    return res.status(400).json({ error: 'Missing "eventSlug" query parameter' });
  }

  try {
    const url = `https://gotag.me/photos/${eventSlug}/${page}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `GoTag returned ${response.status}` });
    }

    const html = await response.text();

    const mediumRegex = /src="(https:\/\/photos\.gotag\.me\/uploads\/medium_[^"]+)"/g;
    const originalRegex = /data-original-url="(https:\/\/photos\.gotag\.me\/uploads\/[^"]+)"/g;

    const mediumUrls = [];
    const originalUrls = [];
    let match;

    while ((match = mediumRegex.exec(html)) !== null) {
      mediumUrls.push(match[1]);
    }

    while ((match = originalRegex.exec(html)) !== null) {
      originalUrls.push(match[1]);
    }

    const titleMatch = html.match(/<h3[^>]*class="fw-light"[^>]*>([^<]+)<\/h3>/);
    const eventTitle = titleMatch ? titleMatch[1].trim() : eventSlug;

    const countMatch = html.match(/from\s+([\d,]+)\s+photos/);
    const totalPhotos = countMatch ? parseInt(countMatch[1].replace(/,/g, '')) : mediumUrls.length;
    const totalPages = totalPhotos > 0 ? Math.ceil(totalPhotos / 12) : 1;

    res.json({
      eventTitle,
      totalPhotos,
      totalPages,
      currentPage: parseInt(page),
      photos: mediumUrls.map((medium, i) => ({
        medium,
        original: originalUrls[i] || medium,
      })),
    });
  } catch (err) {
    console.error('GoTag fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch GoTag event' });
  }
});

// GoTag.me — batch fetch multiple pages at once for fast streaming scan
app.get('/api/gotag/batch', async (req, res) => {
  const { eventSlug, startPage = 1, endPage = 5 } = req.query;
  const start = Math.max(1, parseInt(startPage));
  const end = Math.max(start, Math.min(start + 24, parseInt(endPage)));

  try {
    const pagePromises = [];
    for (let p = start; p <= end; p++) {
      const url = `https://gotag.me/photos/${eventSlug}/${p}`;
      pagePromises.push(
        fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        }).then(async r => {
          if (!r.ok) return '';
          return r.text();
        }).catch(() => '')
      );
    }

    const htmlList = await Promise.all(pagePromises);
    const allPhotos = [];

    for (const html of htmlList) {
      if (!html) continue;
      const mediumRegex = /src="(https:\/\/photos\.gotag\.me\/uploads\/medium_[^"]+)"/g;
      const originalRegex = /data-original-url="(https:\/\/photos\.gotag\.me\/uploads\/[^"]+)"/g;

      const mediumUrls = [];
      const originalUrls = [];
      let match;

      while ((match = mediumRegex.exec(html)) !== null) {
        mediumUrls.push(match[1]);
      }

      while ((match = originalRegex.exec(html)) !== null) {
        originalUrls.push(match[1]);
      }

      for (let i = 0; i < mediumUrls.length; i++) {
        allPhotos.push({
          medium: mediumUrls[i],
          original: originalUrls[i] || mediumUrls[i],
        });
      }
    }

    res.json({
      startPage: start,
      endPage: end,
      photos: allPhotos,
    });
  } catch (err) {
    console.error('GoTag batch fetch error:', err.message);
    res.status(500).json({ error: 'Failed to batch fetch GoTag pages' });
  }
});

app.use(express.static(join(__dirname, 'dist')));

app.listen(PORT, () => {
  console.log(`🚀 NemuFoto proxy server with Sharp acceleration running on http://localhost:${PORT}`);
});
