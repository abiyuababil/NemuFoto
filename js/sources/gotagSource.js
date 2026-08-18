/**
 * gotagSource.js — GoTag.me event photo integration
 */

/**
 * Parse a GoTag.me event link
 * @param {string} url
 * @returns {{eventSlug: string, page: number}|null}
 */
export function parseGotagLink(url) {
  if (!url) return null;

  // https://gotag.me/photos/{eventSlug}/{pageNum}
  // https://gotag.me/photos/120617-kemlu-run-2026/1
  // https://gotag.me/search/{eventSlug}/bib/{number}
  const match = url.match(/gotag\.me\/photos\/([a-zA-Z0-9_-]+)(?:\/(\d+))?/);
  if (match) {
    return {
      eventSlug: match[1],
      page: parseInt(match[2] || '1'),
    };
  }

  return null;
}

/**
 * Fetch event photos from GoTag.me via proxy
 * @param {string} eventSlug
 * @param {number} page
 * @returns {Promise<{eventTitle: string, totalPhotos: number, totalPages: number, currentPage: number, photos: Array<{medium: string, original: string}>}>}
 */
export async function fetchEventPhotos(eventSlug, page = 1) {
  const response = await fetch(`/api/gotag/photos?eventSlug=${encodeURIComponent(eventSlug)}&page=${page}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `GoTag.me error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch a batch of pages in parallel
 * @param {string} eventSlug
 * @param {number} startPage
 * @param {number} endPage
 * @returns {Promise<Array<{medium: string, original: string}>>}
 */
export async function fetchBatchPages(eventSlug, startPage, endPage) {
  const response = await fetch(`/api/gotag/batch?eventSlug=${encodeURIComponent(eventSlug)}&startPage=${startPage}&endPage=${endPage}`);
  if (!response.ok) {
    throw new Error('Batch fetch failed');
  }
  const data = await response.json();
  return data.photos || [];
}

/**
 * Fetch multiple pages of event photos
 * @param {string} eventSlug
 * @param {number} startPage
 * @param {number} endPage
 * @param {function} onPageLoaded - Callback for each page loaded
 * @returns {Promise<Array<{medium: string, original: string}>>}
 */
export async function fetchMultiplePages(eventSlug, startPage, endPage, onPageLoaded) {
  const allPhotos = [];
  const batchSize = 10;

  for (let page = startPage; page <= endPage; page += batchSize) {
    const currentEnd = Math.min(page + batchSize - 1, endPage);
    try {
      const photos = await fetchBatchPages(eventSlug, page, currentEnd);
      allPhotos.push(...photos);
      onPageLoaded?.(currentEnd, photos.length);
    } catch {
      // Fallback to single page
      for (let p = page; p <= currentEnd; p++) {
        try {
          const data = await fetchEventPhotos(eventSlug, p);
          allPhotos.push(...data.photos);
          onPageLoaded?.(p, data.photos.length);
        } catch (e) {
          console.warn(`Skip page ${p}:`, e);
        }
      }
    }
  }

  return allPhotos;
}

/**
 * Get proxied URL for a GoTag photo
 * @param {string} photoUrl
 * @returns {string}
 */
export function getProxiedUrl(photoUrl) {
  return `/api/proxy?url=${encodeURIComponent(photoUrl)}`;
}
