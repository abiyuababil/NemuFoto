/**
 * driveSource.js — Google Drive API integration
 */

const API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY || '';

/**
 * Parse a Google Drive folder link and extract the folder ID
 * @param {string} url
 * @returns {string|null} folder ID or null
 */
export function parseDriveLink(url) {
  if (!url) return null;

  // https://drive.google.com/drive/folders/{folderId}
  // https://drive.google.com/drive/folders/{folderId}?usp=sharing
  // https://drive.google.com/drive/u/0/folders/{folderId}
  const patterns = [
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * List image files in a Google Drive folder
 * @param {string} folderId
 * @returns {Promise<Array<{id: string, name: string, mimeType: string, thumbnailLink: string}>>}
 */
export async function listImages(folderId) {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('Google Drive API Key belum diset. Edit file .env dan masukkan API Key.');
  }

  const allFiles = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      key: API_KEY,
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink)',
      pageSize: '100',
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('Folder tidak ditemukan. Pastikan folder di-share sebagai "Anyone with the link".');
      }
      throw new Error(error.error?.message || `Google Drive API error: ${response.status}`);
    }

    const data = await response.json();
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Get a proxied image URL for a Google Drive file
 * @param {string} fileId
 * @returns {string}
 */
export function getImageUrl(fileId) {
  const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  return `/api/proxy?url=${encodeURIComponent(directUrl)}`;
}

/**
 * Get thumbnail URL
 * @param {object} file - File object from Drive API
 * @returns {string}
 */
export function getThumbnailUrl(file) {
  if (file.thumbnailLink) {
    return `/api/proxy?url=${encodeURIComponent(file.thumbnailLink)}`;
  }
  return getImageUrl(file.id);
}
