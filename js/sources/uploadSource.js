/**
 * uploadSource.js — Direct file upload handler
 */

import { createImageFromFile } from '../utils.js';

/**
 * Process uploaded files and return image data
 * @param {FileList|File[]} files
 * @returns {Promise<Array<{image: HTMLImageElement, name: string, file: File}>>}
 */
export async function processFiles(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));

  if (imageFiles.length === 0) {
    throw new Error('Tidak ada file gambar yang ditemukan.');
  }

  const results = [];

  for (const file of imageFiles) {
    try {
      const image = await createImageFromFile(file);
      results.push({
        image,
        name: file.name,
        file,
      });
    } catch (err) {
      console.warn(`Failed to load file: ${file.name}`, err);
    }
  }

  return results;
}

/**
 * Create a thumbnail data URL from a file
 * @param {File} file
 * @param {number} maxSize
 * @returns {Promise<string>}
 */
export async function createThumbnail(file, maxSize = 80) {
  const image = await createImageFromFile(file);

  const canvas = document.createElement('canvas');
  const ratio = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
  canvas.width = image.naturalWidth * ratio;
  canvas.height = image.naturalHeight * ratio;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.6);
}
