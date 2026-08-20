/**
 * keepAlive.js — Keeps background tabs active & prevents device sleep during scanning
 */

let audioCtx = null;
let oscillatorNode = null;
let wakeLockSentinel = null;

/**
 * Start silent audio keep-alive and screen wake lock
 */
export async function startKeepAlive() {
  // 1. Web Audio Keep-Alive (prevents background tab throttling in Chrome/Edge/Firefox)
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !audioCtx) {
      audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Create continuous silent oscillator (gain virtually zero, humanly silent)
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.00001;

      oscillatorNode = audioCtx.createOscillator();
      oscillatorNode.frequency.value = 440;
      oscillatorNode.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillatorNode.start();
    }
  } catch (err) {
    console.debug('Web Audio keep-alive note:', err);
  }

  // 2. Screen Wake Lock API (prevents device from locking/sleeping)
  try {
    if ('wakeLock' in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
    }
  } catch (err) {
    console.debug('Wake lock note:', err);
  }
}

/**
 * Stop keep-alive and release audio & wake lock resources
 */
export async function stopKeepAlive() {
  // 1. Stop audio oscillator & close context
  try {
    if (oscillatorNode) {
      oscillatorNode.stop();
      oscillatorNode.disconnect();
      oscillatorNode = null;
    }
    if (audioCtx) {
      await audioCtx.close();
      audioCtx = null;
    }
  } catch (err) {
    console.debug('Error closing audio keep-alive:', err);
  }

  // 2. Release wake lock
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (err) {
    console.debug('Error releasing wake lock:', err);
  }
}
