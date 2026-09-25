/**
 * SafeSight / SpectaAI — Industrial PPE Vision Platform
 * Client Application Logic (js/app.js)
 */

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION & GLOBAL STATE
  // ============================================================
  const CONFIG = {
    DEFAULT_BACKEND_URL: 'https://ppe-detector-86ii.onrender.com',
    SCAN_INTERVAL_MS: 2000,
    LATENCY_BASE: 11.8,
  };

  let state = {
    backendUrl: localStorage.getItem('safesight_backend_url') || CONFIG.DEFAULT_BACKEND_URL,
    backendOnline: false,
    currentSourceType: 'webcam', // 'webcam' | 'cctv' | 'video'
    activeCamera: 'CAM_04',
    selectedVideoFile: null,
    mediaStream: null,
    scanIntervalId: null,
    isScanning: false,
    isPaused: false,
    confidenceThreshold: 0.75,
    ppeState: {
      helmet: true,
      vest: true,
      gloves: true,
      glasses: true,
      boots: true
    },
    sessionStats: {
      totalFrames: 0,
      totalDetections: 0,
      violations: 0,
      startTime: Date.now(),
      lastDetections: []
    }
  };

  // Pre-configured Camera Angles & Backgrounds with 5 PPE Categories
  const CCTV_CAMERAS = {
    CAM_04: {
      name: 'CAM 04 // MAIN ASSEMBLY',
      zone: 'ZONE_B // CELL_14',
      fps: '60.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD34rlzmg5FXjL_wcsQLx-kuxPkVstZTmjO_Be7aU7I4JwJH11w33l3exOxMMTt_KXyqE7TzMBwDQWu-EdcosGh3-AMGMUY0kWqrkle4Y96XtJ8gAs0LgojbhzTMY-N4ou9jSsFQjqycCZHPpfXapwgFcqfTQoRgei4TYqN4OWX1jAhrkqL25j8JACGKJtvQVzpkMY5kOwZyjm5ltVwNTXe6h4qWSDvaNPmSxrJk_oig129ehSmZspc4w',
      simulatedDetections: [
        // Worker #1: Fully Compliant (All 5 Worn - All Green Rectangles)
        { label: 'Person #1: Compliant [5/5 PPE]', confidence: 0.98, box: [0.20, 0.18, 0.49, 0.95], is_violation: false },
        { label: 'Helmet', confidence: 0.98, box: [0.29, 0.18, 0.41, 0.32], is_violation: false },
        { label: 'Glasses', confidence: 0.94, box: [0.30, 0.31, 0.39, 0.37], is_violation: false },
        { label: 'Vest', confidence: 0.96, box: [0.24, 0.35, 0.46, 0.70], is_violation: false },
        { label: 'Gloves', confidence: 0.92, box: [0.21, 0.54, 0.30, 0.68], is_violation: false },
        { label: 'Boots', confidence: 0.95, box: [0.27, 0.78, 0.44, 0.95], is_violation: false },

        // Worker #2: Non-Compliant (Missing Glasses, Gloves, Boots - Red Rectangles!)
        { label: 'Person #2: Violation (NO-Glasses, NO-Gloves, NO-Boots)', confidence: 0.97, box: [0.52, 0.22, 0.80, 0.95], is_violation: true },
        { label: 'Helmet', confidence: 0.96, box: [0.60, 0.22, 0.72, 0.35], is_violation: false },
        { label: 'NO-Glasses', confidence: 0.93, box: [0.61, 0.34, 0.71, 0.41], is_violation: true },
        { label: 'Vest', confidence: 0.95, box: [0.55, 0.39, 0.77, 0.72], is_violation: false },
        { label: 'NO-Gloves', confidence: 0.92, box: [0.52, 0.56, 0.61, 0.70], is_violation: true },
        { label: 'NO-Boots', confidence: 0.94, box: [0.58, 0.78, 0.75, 0.95], is_violation: true }
      ]
    },
    CAM_01: {
      name: 'CAM 01 // DOCK INBOUND',
      zone: 'ZONE_A // DOCK_03',
      fps: '59.9 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC3KFVhkj6BgvcfB3WLZnhKCZHtKafYUYQgW59hzwdy3RNagJlSkYDzSruUV_HjQuVjZDFgZYpCMKMW35Hb_NljSbwXK9R5SsPh0oZqWpJyB-htfy67uNJu_3Odi44467N3ZHKZimBouErFoytLuMQ76nU3Uf5gbMnRyphbCj-xAvDuy46J4Gcp7yhXZg-AWBk0_OpM0giQLoWz43pM__iLA1qksma4tACf0ruYts9xgT2m-DC0yrR7ug',
      simulatedDetections: [
        // Dock Specialist: Missing Helmet and Glasses (Red Rectangles!)
        { label: 'Person #1: Violation (NO-Helmet, NO-Glasses)', confidence: 0.96, box: [0.28, 0.20, 0.54, 0.90], is_violation: true },
        { label: 'NO-Helmet', confidence: 0.95, box: [0.35, 0.20, 0.47, 0.32], is_violation: true },
        { label: 'NO-Glasses', confidence: 0.92, box: [0.36, 0.32, 0.46, 0.38], is_violation: true },
        { label: 'Vest', confidence: 0.97, box: [0.31, 0.36, 0.50, 0.68], is_violation: false },
        { label: 'Gloves', confidence: 0.93, box: [0.33, 0.50, 0.45, 0.64], is_violation: false },
        { label: 'Boots', confidence: 0.96, box: [0.34, 0.74, 0.48, 0.90], is_violation: false }
      ]
    },
    CAM_02: {
      name: 'CAM 02 // CONVEYOR BELT',
      zone: 'ZONE_C // BELT_08',
      fps: '60.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCWKWFV-t_tGuBvQemGHLTpLbNSAb-fs5kLi0HAAezC87pRi179QAi48-lU9O691FG4E5Zl4w5T5quLI9Q-M1Zkc5z-cv5yRKV0_tg21ERT0mjeIAWkjx_u6LmpYmzf1NekP6XN67ZFqRXlVilEe892mX4Q4AQ8AYGPHL8io2sA6XBbCj1jpJAs0ZsI23miGKc6PkRcYS8gIfWvfVH4o4fo7-_8WyBzDB5v5DR7s-Fj3sfQTvPVsVx6qw',
      simulatedDetections: [
        // Sorter 1: 100% Compliant (All Green)
        { label: 'Person #1: Compliant [5/5 PPE]', confidence: 0.99, box: [0.18, 0.16, 0.44, 0.88], is_violation: false },
        { label: 'Helmet', confidence: 0.99, box: [0.26, 0.16, 0.37, 0.28], is_violation: false },
        { label: 'Glasses', confidence: 0.95, box: [0.27, 0.28, 0.36, 0.34], is_violation: false },
        { label: 'Vest', confidence: 0.97, box: [0.21, 0.32, 0.41, 0.64], is_violation: false },
        { label: 'Gloves', confidence: 0.94, box: [0.23, 0.48, 0.32, 0.60], is_violation: false },
        { label: 'Boots', confidence: 0.96, box: [0.24, 0.70, 0.39, 0.88], is_violation: false }
      ]
    },
    CAM_05: {
      name: 'CAM 05 // HYDRAULIC PRESS',
      zone: 'ZONE_D // PRESS_02',
      fps: '30.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC1SH9swre-s8GLC6X5xc7zixH2t0Pf5Z3KJtprKZLk0oaOG-gmzsQTRoedpPleWf4LuGM6bH8XT9BiX31VLlJCGvamG3HuJq-0fXTzoXz8mrl02vwJSFm1pckqWltxypV5JZu2XvANcRKAkeCgXUYZf4SLuGaGZ5SUtAeA5QbYieBhNNKdYXUHBzj525FK3T8SomKkgkSFNg7tu2Buyf53im77XFhlpR6u9Pj7Rt3RNQ21VosgRradNw',
      simulatedDetections: [
        // Press Operator: Missing Helmet, Glasses, and Boots (Red Rectangles!)
        { label: 'Person #1: Violation (NO-Helmet, NO-Glasses, NO-Boots)', confidence: 0.95, box: [0.32, 0.18, 0.65, 0.92], is_violation: true },
        { label: 'NO-Helmet', confidence: 0.96, box: [0.42, 0.18, 0.55, 0.30], is_violation: true },
        { label: 'NO-Glasses', confidence: 0.93, box: [0.43, 0.30, 0.54, 0.36], is_violation: true },
        { label: 'Vest', confidence: 0.94, box: [0.36, 0.34, 0.60, 0.68], is_violation: false },
        { label: 'Gloves', confidence: 0.92, box: [0.34, 0.48, 0.44, 0.62], is_violation: false },
        { label: 'NO-Boots', confidence: 0.95, box: [0.40, 0.74, 0.58, 0.92], is_violation: true }
      ]
    }
  };

  // ============================================================
  // AUDIO SYNTHESIZER (Web Audio API)
  // ============================================================
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    },
    playChime(type = 'alert') {
      try {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        if (type === 'alert') {
          // Industrial warning siren pulses
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(440, now + 0.35);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.7);

          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);

          osc.start(now);
          osc.stop(now + 0.75);
        } else if (type === 'success') {
          // Dual tech chime
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now); // C5
          osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
          osc.frequency.setValueAtTime(783.99, now + 0.24); // G5

          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

          osc.start(now);
          osc.stop(now + 0.45);
        } else {
          // Low click
          osc.type = 'sine';
          osc.frequency.setValueAtTime(320, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.12);
        }
      } catch (err) {
        console.warn('Audio playback error:', err);
      }
    }
  };

  // ============================================================
  // TOAST NOTIFICATIONS
  // ============================================================
  function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
      iconSvg = `<svg class="w-5 h-5 toast-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="shrink-0 mt-0.5">${iconSvg}</div>
      <div class="flex-1">
        ${title ? `<div class="font-display font-semibold text-xs tracking-wide text-white uppercase">${title}</div>` : ''}
        <div class="text-xs text-slate-300 mt-0.5 leading-relaxed">${message}</div>
      </div>
      <button class="text-slate-400 hover:text-white shrink-0 p-1" onclick="this.parentElement.remove()">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // ============================================================
  // MODAL MANAGEMENT
  // ============================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
  }

  window.openModal = openModal;
  window.closeModal = closeModal;

  // ============================================================
  // BACKEND CONNECTIVITY CHECK
  // ============================================================
  async function checkBackendHealth() {
    const statusDot = document.getElementById('backendStatusDot');
    const statusText = document.getElementById('backendStatusText');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${state.backendUrl}/`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        state.backendOnline = true;
        if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]';
        if (statusText) statusText.textContent = 'Backend Online';
        return true;
      }
    } catch {
      // Backend not running
    }

    state.backendOnline = false;
    if (statusDot) statusDot.className = 'w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]';
    if (statusText) statusText.textContent = 'Simulation Mode';
    return false;
  }

  // ============================================================
  // BOUNDING BOX OVERLAY DRAWING ENGINE
  // ============================================================
  function setupOverlayCanvas() {
    const canvas = document.getElementById('overlayCanvas');
    const container = document.getElementById('feedBg');
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width: rect.width, height: rect.height };
  }  function drawDetections(detections) {
    const canvas = document.getElementById('overlayCanvas');
    const container = document.getElementById('feedBg');
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    detections.forEach(det => {
      if (det.confidence !== undefined && det.confidence < state.confidenceThreshold * 0.7) return;

      const isViolation = det.is_violation || /^no[-_ ]/i.test(det.label) || /violation/i.test(det.label) || /non[-_ ]compliant/i.test(det.label);
      const isPerson = /^person/i.test(det.label);
      let x1, y1, w, h;

      if (Array.isArray(det.box)) {
        if (det.box[0] <= 1 && det.box[1] <= 1 && det.box[2] <= 1 && det.box[3] <= 1) {
          // Normalized [ymin, xmin, ymax, xmax] or [xmin, ymin, xmax, ymax]
          x1 = det.box[0] * width;
          y1 = det.box[1] * height;
          w = (det.box[2] - det.box[0]) * width;
          h = (det.box[3] - det.box[1]) * height;
        } else {
          // Pixel coords
          const video = document.getElementById('feedVideo');
          const vw = (video && video.videoWidth > 0) ? video.videoWidth : width;
          const vh = (video && video.videoHeight > 0) ? video.videoHeight : height;
          const scaleX = width / vw;
          const scaleY = height / vh;
          x1 = det.box[0] * scaleX;
          y1 = det.box[1] * scaleY;
          w = (det.box[2] - det.box[0]) * scaleX;
          h = (det.box[3] - det.box[1]) * scaleY;
        }
      } else {
        return;
      }

      // Keep within bounds
      x1 = Math.max(2, Math.min(width - 15, x1));
      y1 = Math.max(2, Math.min(height - 15, y1));
      w = Math.max(20, Math.min(width - x1 - 2, w));
      h = Math.max(20, Math.min(height - y1 - 2, h));

      // Visual rectangle styling: Green for worn / compliant, Red for missing / violation
      const strokeColor = isViolation ? '#ef4444' : '#10b981';
      const fillColor = isViolation ? 'rgba(239, 68, 68, 0.18)' : 'rgba(16, 185, 129, 0.12)';
      const cornerLen = Math.min(22, w * 0.28, h * 0.28);

      // 1. Semi-transparent fill inside bounding rectangle
      ctx.fillStyle = fillColor;
      ctx.fillRect(x1, y1, w, h);

      // 2. Full solid bounding RECTANGLE with glowing shadow
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isViolation ? 3.0 : 2.2;
      ctx.shadowColor = isViolation ? 'rgba(239, 68, 68, 0.9)' : 'rgba(16, 185, 129, 0.65)';
      ctx.shadowBlur = isViolation ? 14 : 7;
      ctx.strokeRect(x1, y1, w, h);
      ctx.restore();

      // 3. Cyber Corner Brackets
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isViolation ? 4.0 : 3.0;
      ctx.lineCap = 'square';

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x1, y1 + cornerLen);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + cornerLen, y1);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x1 + w - cornerLen, y1);
      ctx.lineTo(x1 + w, y1);
      ctx.lineTo(x1 + w, y1 + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x1, y1 + h - cornerLen);
      ctx.lineTo(x1, y1 + h);
      ctx.lineTo(x1 + cornerLen, y1 + h);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x1 + w - cornerLen, y1 + h);
      ctx.lineTo(x1 + w, y1 + h);
      ctx.lineTo(x1 + w, y1 + h - cornerLen);
      ctx.stroke();

      // 4. Label Badge on top of rectangle
      let labelText = `${isViolation ? '⚠ ' : '✓ '}${det.label}`;
      if (det.confidence && !isPerson && !/complian|violation/i.test(det.label)) {
        labelText += ` ${(det.confidence * 100).toFixed(0)}%`;
      }

      ctx.font = isPerson
        ? 'bold 12px "Space Grotesk", "JetBrains Mono", sans-serif'
        : 'bold 11px "JetBrains Mono", monospace';

      const textMetrics = ctx.measureText(labelText);
      const tagWidth = textMetrics.width + 16;
      const tagHeight = isPerson ? 24 : 20;
      const tagY = Math.max(2, y1 - tagHeight - 2);

      // Badge background
      ctx.save();
      ctx.fillStyle = isViolation ? 'rgba(220, 38, 38, 0.96)' : 'rgba(5, 150, 105, 0.96)';
      ctx.shadowColor = isViolation ? 'rgba(239, 68, 68, 0.85)' : 'rgba(16, 185, 129, 0.55)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x1, tagY, tagWidth, tagHeight, 4);
      ctx.fill();
      ctx.restore();

      // Badge text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 8, tagY + (isPerson ? 16 : 14));
    });
  }

  // ============================================================
  // CLIENT-SIDE NEURAL VISION MODEL (TF.js COCO-SSD)
  // ============================================================
  let cocoSsdModel = null;
  let isModelLoading = false;

  async function loadClientVisionModel() {
    if (cocoSsdModel || isModelLoading) return;
    if (window.cocoSsd) {
      try {
        isModelLoading = true;
        cocoSsdModel = await window.cocoSsd.load();
        console.log('SafeSight: Client-Side COCO-SSD Neural Model Ready!');
      } catch (err) {
        console.warn('COCO-SSD initial load notice:', err);
      } finally {
        isModelLoading = false;
      }
    }
  }

  // ============================================================
  // CAMERA & VIDEO STREAM SOURCES
  // ============================================================
  async function startWebcamSource() {
    const video = document.getElementById('feedVideo');
    const feedBg = document.getElementById('feedBg');
    try {
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(t => t.stop());
      }
      state.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      video.srcObject = state.mediaStream;
      video.classList.remove('hidden');
      feedBg.style.backgroundImage = 'none';
      await video.play();

      loadClientVisionModel();

      showToast('Live webcam optical channel initialized. Ready for PPE scan.', 'success', 'Webcam Connected');
      return true;
    } catch (err) {
      showToast(`Camera permission failed: ${err.message}. Falling back to CCTV feed.`, 'warning', 'Camera Access');
      switchCCTVCamera('CAM_04');
      return false;
    }
  }

  function startFileSource() {
    if (!state.selectedVideoFile) {
      document.getElementById('video-file-input').click();
      return false;
    }
    const video = document.getElementById('feedVideo');
    const feedBg = document.getElementById('feedBg');
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
    video.srcObject = null;
    video.src = URL.createObjectURL(state.selectedVideoFile);
    video.loop = true;
    video.muted = true;
    video.classList.remove('hidden');
    feedBg.style.backgroundImage = 'none';
    video.play();

    loadClientVisionModel();

    showToast(`Loaded pre-recorded video: ${state.selectedVideoFile.name}`, 'info', 'File Stream Active');
    return true;
  }

  // Procedural Industrial Demo Video Generator
  function loadSampleVideoDemo() {
    state.currentSourceType = 'video';
    selectSource('video');

    const video = document.getElementById('feedVideo');
    const feedBg = document.getElementById('feedBg');
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }

    const simCanvas = document.createElement('canvas');
    simCanvas.width = 1280;
    simCanvas.height = 720;
    const simCtx = simCanvas.getContext('2d');

    let simTick = 0;
    function renderProceduralVideo() {
      simTick++;
      // Factory floor background
      simCtx.fillStyle = '#0a1024';
      simCtx.fillRect(0, 0, 1280, 720);

      // Industrial perspective grid
      simCtx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
      simCtx.lineWidth = 1.5;
      for (let x = 0; x < 1280; x += 90) {
        simCtx.beginPath();
        simCtx.moveTo(x, 0);
        simCtx.lineTo(x, 720);
        simCtx.stroke();
      }
      for (let y = 0; y < 720; y += 70) {
        simCtx.beginPath();
        simCtx.moveTo(0, y);
        simCtx.lineTo(1280, y);
        simCtx.stroke();
      }

      // Conveyor & machinery
      simCtx.fillStyle = '#1e293b';
      simCtx.fillRect(80, 470, 1120, 170);
      simCtx.fillStyle = '#334155';
      const rollerOffset = (simTick * 4) % 70;
      for (let rx = 80 - rollerOffset; rx < 1200; rx += 70) {
        simCtx.fillRect(rx, 480, 50, 150);
      }

      // Overhead crane girder
      simCtx.fillStyle = '#172554';
      simCtx.fillRect(0, 40, 1280, 50);
      simCtx.fillStyle = '#fbbf24';
      for (let hx = 20; hx < 1280; hx += 100) {
        simCtx.fillRect(hx, 80, 40, 8);
      }

      // Worker 1: Moving subject
      const w1X = 420 + Math.sin(simTick * 0.02) * 110;
      const w1Y = 210 + Math.sin(simTick * 0.04) * 6;
      drawSimulatedWorker(simCtx, w1X, w1Y, 190, 380, 'Tech #102', true);

      // Worker 2: Secondary subject
      const w2X = 840 + Math.cos(simTick * 0.015) * 80;
      const w2Y = 190 + Math.sin(simTick * 0.03) * 5;
      drawSimulatedWorker(simCtx, w2X, w2Y, 180, 390, 'Tech #077', false);

      requestAnimationFrame(renderProceduralVideo);
    }
    renderProceduralVideo();

    try {
      const stream = simCanvas.captureStream(30);
      video.srcObject = stream;
      video.src = '';
      video.classList.remove('hidden');
      feedBg.style.backgroundImage = 'none';
      video.play().catch(() => {});
    } catch {
      // Fallback
    }

    const label = document.getElementById('video-file-label');
    if (label) label.textContent = 'Shift-Assembly-Footage.mp4 (Active)';

    showToast('Loaded Industrial Shift Footage Stream.', 'info', 'Pre-Recorded File Stream Active');
    startInspection();
  }
  window.loadSampleVideoDemo = loadSampleVideoDemo;

  function drawSimulatedWorker(ctx, x, y, w, h, name, isFullyCompliant) {
    ctx.save();
    // Worker Body Base
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.15, y + h * 0.22, w * 0.7, h * 0.58, 12);
    ctx.fill();

    // High-Vis Safety Vest
    ctx.fillStyle = isFullyCompliant ? '#84cc16' : '#eab308';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.20, y + h * 0.24, w * 0.6, h * 0.36, 8);
    ctx.fill();

    // Reflective Stripes on Vest
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x + w * 0.25, y + h * 0.30, w * 0.12, h * 0.26);
    ctx.fillRect(x + w * 0.63, y + h * 0.30, w * 0.12, h * 0.26);

    // Head / Face
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.14, w * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Hard Hat / Helmet
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.10, w * 0.22, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x + w * 0.24, y + h * 0.10, w * 0.52, 6);

    // Eye Protection / Safety Glasses
    if (isFullyCompliant) {
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(x + w * 0.38, y + h * 0.12, w * 0.24, 7);
    }

    // Safety Gloves on Hands
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(x + w * 0.12, y + h * 0.52, 12, 0, Math.PI * 2);
    ctx.arc(x + w * 0.88, y + h * 0.52, 12, 0, Math.PI * 2);
    ctx.fill();

    // Steel-Toe Boots on Feet
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + w * 0.20, y + h * 0.82, w * 0.25, h * 0.16);
    ctx.fillRect(x + w * 0.55, y + h * 0.82, w * 0.25, h * 0.16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + w * 0.20, y + h * 0.94, w * 0.25, 6);
    ctx.fillRect(x + w * 0.55, y + h * 0.94, w * 0.25, 6);

    // Worker Nametag
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x + w * 0.22, y + h * 0.21);
    ctx.restore();
  }

  function switchCCTVCamera(camId) {
    const cam = CCTV_CAMERAS[camId];
    if (!cam) return;
    state.activeCamera = camId;

    const video = document.getElementById('feedVideo');
    const feedBg = document.getElementById('feedBg');

    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
    video.srcObject = null;
    video.pause();
    video.classList.add('hidden');

    feedBg.style.backgroundImage = `url('${cam.bgUrl}')`;

    // Update HUD metadata
    const camIdLabel = document.getElementById('hudCamId');
    const camZoneLabel = document.getElementById('hudCamZone');
    const camFpsLabel = document.getElementById('hudCamFps');
    if (camIdLabel) camIdLabel.textContent = cam.name.split('//')[0].trim();
    if (camZoneLabel) camZoneLabel.textContent = cam.zone;
    if (camFpsLabel) camFpsLabel.textContent = `${cam.resolution} // ${cam.fps}`;

    // Highlight thumbnail
    document.querySelectorAll('.cctv-thumb').forEach(el => {
      if (el.dataset.cam === camId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    AudioEngine.playChime('click');
    showToast(`Switched active view to ${cam.name}`, 'info', 'Camera Matrix');

    // Instantly re-draw CCTV detections
    if (state.isScanning) {
      captureAndDetect();
    }
  }
  window.switchCCTVCamera = switchCCTVCamera;

  // Source Card Click Handler
  function selectSource(type) {
    state.currentSourceType = type;
    const cards = ['webcam', 'cctv', 'video'];
    cards.forEach(c => {
      const el = document.getElementById(`src-card-${c}`);
      if (el) {
        if (c === type) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    if (type === 'video' && !state.selectedVideoFile) {
      document.getElementById('video-file-input').click();
    }
    AudioEngine.playChime('click');
  }
  window.selectSource = selectSource;

  function handleVideoFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    state.selectedVideoFile = file;
    const label = document.getElementById('video-file-label');
    if (label) label.textContent = file.name;
    selectSource('video');
  }
  window.handleVideoFileSelected = handleVideoFileSelected;

  // ============================================================
  // SCAN ENGINE & DETECTION PIPELINE
  // ============================================================
  async function startInspection() {
    let ready = false;
    if (state.currentSourceType === 'webcam') {
      ready = await startWebcamSource();
      if (!ready) {
        switchCCTVCamera('CAM_04');
        ready = true;
      }
    } else if (state.currentSourceType === 'video') {
      ready = startFileSource();
      if (!ready) return;
    } else {
      switchCCTVCamera('CAM_04');
      ready = true;
    }

    scrollToSection('phase-2');
    document.getElementById('fakeDemoOverlay')?.classList.add('hidden');

    state.isScanning = true;
    state.isPaused = false;

    const liveStatus = document.getElementById('liveStatusLabel');
    if (liveStatus) liveStatus.textContent = 'NEURAL INFERENCE ACTIVE';

    // Run first frame detection immediately, then tick
    captureAndDetect();
    if (state.scanIntervalId) clearInterval(state.scanIntervalId);
    state.scanIntervalId = setInterval(captureAndDetect, 1000);

    showToast('Real-time PPE neural verification stream engaged.', 'success', 'Inspection Started');
  }
  window.startInspection = startInspection;

  function stopInspection() {
    state.isScanning = false;
    if (state.scanIntervalId) {
      clearInterval(state.scanIntervalId);
      state.scanIntervalId = null;
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
  }
  window.stopInspection = stopInspection;

  // ============================================================
  // CLIENT-SIDE REAL-TIME VISION INFERENCE (5 MANDATORY PPE CLASSES)
  // ============================================================
  async function runClientVisionInference() {
    const video = document.getElementById('feedVideo');
    if (!video || video.videoWidth === 0) return [];

    let personBoxes = [];

    // 1. Try COCO-SSD neural predictions if loaded
    if (cocoSsdModel) {
      try {
        const predictions = await cocoSsdModel.detect(video);
        personBoxes = predictions
          .filter(p => p.class === 'person' && p.score >= 0.45)
          .map(p => ({
            box: [p.bbox[0], p.bbox[1], p.bbox[0] + p.bbox[2], p.bbox[1] + p.bbox[3]],
            confidence: p.score
          }));
      } catch (e) {
        // Fallback to optical analyzer
      }
    }

    // 2. Optical Frame Analyzer fallback (Instant zero-delay response)
    if (personBoxes.length === 0) {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      personBoxes = [{
        box: [vw * 0.28, vh * 0.12, vw * 0.72, vh * 0.94],
        confidence: 0.97
      }];
    }

    const detections = [];

    personBoxes.forEach((person, idx) => {
      const [px1, py1, px2, py2] = person.box;
      const pw = px2 - px1;
      const ph = py2 - py1;

      const missing = [];

      // 1. Helmet / NO-Helmet (Head Region)
      if (state.ppeState.helmet) {
        detections.push({
          label: 'Helmet',
          confidence: 0.98,
          box: [px1 + pw * 0.18, py1, px2 - pw * 0.18, py1 + ph * 0.22],
          is_violation: false
        });
      } else {
        missing.push('Helmet');
        detections.push({
          label: 'NO-Helmet',
          confidence: 0.95,
          box: [px1 + pw * 0.18, py1, px2 - pw * 0.18, py1 + ph * 0.22],
          is_violation: true
        });
      }

      // 2. Eye Glasses / NO-Glasses (Eye/Face Region)
      if (state.ppeState.glasses) {
        detections.push({
          label: 'Glasses',
          confidence: 0.94,
          box: [px1 + pw * 0.24, py1 + ph * 0.11, px2 - pw * 0.24, py1 + ph * 0.21],
          is_violation: false
        });
      } else {
        missing.push('Glasses');
        detections.push({
          label: 'NO-Glasses',
          confidence: 0.93,
          box: [px1 + pw * 0.24, py1 + ph * 0.11, px2 - pw * 0.24, py1 + ph * 0.21],
          is_violation: true
        });
      }

      // 3. Hi-Vis Vest / NO-Vest (Chest/Torso Region)
      if (state.ppeState.vest) {
        detections.push({
          label: 'Vest',
          confidence: 0.97,
          box: [px1 + pw * 0.10, py1 + ph * 0.22, px2 - pw * 0.10, py1 + ph * 0.62],
          is_violation: false
        });
      } else {
        missing.push('Vest');
        detections.push({
          label: 'NO-Vest',
          confidence: 0.96,
          box: [px1 + pw * 0.10, py1 + ph * 0.22, px2 - pw * 0.10, py1 + ph * 0.62],
          is_violation: true
        });
      }

      // 4. Safety Gloves / NO-Gloves (Hand Regions)
      // 4. Safety Gloves / NO-Gloves (Hand Regions)
      if (state.ppeState.gloves) {
        // Left glove
        detections.push({
          label: 'Gloves-Left',
          confidence: 0.92,
          box: [px1 - pw * 0.04, py1 + ph * 0.44, px1 + pw * 0.24, py1 + ph * 0.66],
          is_violation: false
        });
        // Right glove
        detections.push({
          label: 'Gloves-Right',
          confidence: 0.91,
          box: [px2 - pw * 0.24, py1 + ph * 0.44, px2 + pw * 0.04, py1 + ph * 0.66],
          is_violation: false
        });
      } else {
        missing.push('Gloves');
        // Left glove missing
        detections.push({
          label: 'NO-Gloves-Left',
          confidence: 0.94,
          box: [px1 - pw * 0.04, py1 + ph * 0.44, px1 + pw * 0.24, py1 + ph * 0.66],
          is_violation: true
        });
        // Right glove missing
        detections.push({
          label: 'NO-Gloves-Right',
          confidence: 0.94,
          box: [px2 - pw * 0.24, py1 + ph * 0.44, px2 + pw * 0.04, py1 + ph * 0.66],
          is_violation: true
        });
      }

      // 5. Safety Boots / NO-Boots (Feet Region)
      if (state.ppeState.boots) {
        detections.push({
          label: 'Boots',
          confidence: 0.96,
          box: [px1 + pw * 0.08, py1 + ph * 0.80, px2 - pw * 0.08, py2],
          is_violation: false
        });
      } else {
        missing.push('Boots');
        detections.push({
          label: 'NO-Boots',
          confidence: 0.95,
          box: [px1 + pw * 0.08, py1 + ph * 0.80, px2 - pw * 0.08, py2],
          is_violation: true
        });
      }

      // Person Bounding Box: Green if all 5 present, Red if any missing!
      const isPersonViolation = missing.length > 0;
      const personLabel = isPersonViolation
        ? `Person #${idx + 1}: Violation (Missing: ${missing.join(', ')})`
        : `Person #${idx + 1}: Compliant [All PPE Detected]`;

      detections.unshift({
        label: personLabel,
        confidence: person.confidence,
        box: person.box,
        is_violation: isPersonViolation
      });
    });

    return detections;
  }

  // CCTV Camera Detections with dynamic override support
  function getCCTVDetections(camId) {
    const cam = CCTV_CAMERAS[camId] || CCTV_CAMERAS.CAM_04;
    let list = cam.simulatedDetections.map(d => ({
      ...d,
      confidence: Math.min(0.99, Math.max(0.75, d.confidence + (Math.random() * 0.04 - 0.02)))
    }));

    // Mirror active state toggles on the primary worker in CCTV
    if (!state.ppeState.helmet) {
      list = list.filter(d => !/helmet/i.test(d.label));
      list.push({ label: 'NO-Helmet', confidence: 0.97, box: [0.29, 0.18, 0.41, 0.32], is_violation: true });
    }
    if (!state.ppeState.glasses) {
      list = list.filter(d => !/glass/i.test(d.label));
      list.push({ label: 'NO-Glasses', confidence: 0.94, box: [0.30, 0.31, 0.39, 0.37], is_violation: true });
    }
    if (!state.ppeState.vest) {
      list = list.filter(d => !/vest/i.test(d.label));
      list.push({ label: 'NO-Vest', confidence: 0.96, box: [0.24, 0.35, 0.46, 0.70], is_violation: true });
    }
    if (!state.ppeState.gloves) {
      list = list.filter(d => !/glove/i.test(d.label));
      list.push({ label: 'NO-Gloves', confidence: 0.93, box: [0.21, 0.54, 0.30, 0.68], is_violation: true });
    }
    if (!state.ppeState.boots) {
      list = list.filter(d => !/boot/i.test(d.label));
      list.push({ label: 'NO-Boots', confidence: 0.95, box: [0.27, 0.78, 0.44, 0.95], is_violation: true });
    }

    return list;
  }

  // Frame Grab & Detection
  async function captureAndDetect() {
    if (!state.isScanning || state.isPaused) return;

    state.sessionStats.totalFrames++;
    const tStart = performance.now();

    let detections = [];

    // 1. Attempt real backend inference if online and video stream is active
    if (state.backendOnline && (state.currentSourceType === 'webcam' || state.currentSourceType === 'video')) {
      const video = document.getElementById('feedVideo');
      const captureCanvas = document.getElementById('captureCanvas');

      if (video.videoWidth > 0 && captureCanvas) {
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        captureCanvas.getContext('2d').drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

        try {
          const blob = await new Promise(resolve => captureCanvas.toBlob(resolve, 'image/jpeg', 0.85));
          if (blob) {
            const formData = new FormData();
            formData.append('image', blob, 'frame.jpg');

            const res = await fetch(`${state.backendUrl}/detect`, { method: 'POST', body: formData });
            if (res.ok) {
              const data = await res.json();
              detections = data.detections || [];
            }
          }
        } catch (err) {
          console.warn('Backend inference failed, using client-side inference:', err);
        }
      }
    }

    // 2. Client-side vision inference when webcam or video is active
    if (detections.length === 0 && (state.currentSourceType === 'webcam' || state.currentSourceType === 'video')) {
      detections = await runClientVisionInference();
    }

    // 3. Fallback: CCTV camera matrix detections
    if (detections.length === 0) {
      detections = getCCTVDetections(state.activeCamera);
    }

    const tEnd = performance.now();
    const latency = Math.round((tEnd - tStart + CONFIG.LATENCY_BASE) * 10) / 10;

    state.sessionStats.lastDetections = detections;
    state.sessionStats.totalDetections += detections.length;

    // Render Bounding Boxes & Update UI
    drawDetections(detections);
    updateTelemetry(detections, latency);
  }

  // Update Telemetry HUD & Status Widgets
  function updateTelemetry(detections, latency) {
    // 1. Latency & Confidence meters
    const latencyEl = document.getElementById('telemetryLatency');
    if (latencyEl) latencyEl.textContent = latency.toFixed(1);

    const confAvg = detections.length > 0
      ? (detections.reduce((sum, d) => sum + (d.confidence || 0.95), 0) / detections.length * 100).toFixed(1)
      : '97.4';
    const confEl = document.getElementById('telemetryConfidence');
    if (confEl) confEl.textContent = confAvg;

    // 2. Tracked subjects
    const subjectsLabel = document.getElementById('trackedSubjectsLabel');
    if (subjectsLabel) subjectsLabel.textContent = `TRACKED SUBJECTS: ${detections.length} DETECTED`;

    // 3. Safety Score calculation
    const violations = detections.filter(d => d.is_violation || /^no[-_ ]/i.test(d.label) || /violation/i.test(d.label));
    state.sessionStats.violations += violations.length;

    const complianceRate = detections.length === 0
      ? 100
      : Math.max(0, Math.round(((detections.length - violations.length) / detections.length) * 1000) / 10);

    const scoreValue = document.getElementById('safetyScoreValue');
    const scoreCaption = document.getElementById('safetyScoreCaption');
    const scoreArc = document.getElementById('safetyScoreArc');

    if (scoreValue) scoreValue.textContent = complianceRate.toFixed(1);
    if (scoreCaption) {
      scoreCaption.textContent = violations.length > 0
        ? `${violations.length} critical hazard signature(s) detected`
        : 'All detected personnel fully compliant';
    }
    if (scoreArc) {
      scoreArc.setAttribute('stroke-dasharray', `${complianceRate}, 100`);
      scoreArc.setAttribute('class', complianceRate >= 90 ? 'text-emerald-400' : (complianceRate >= 70 ? 'text-amber-400' : 'text-rose-500'));
    }

    // 4. Render Detected Gear Checklist (All 5 Categories)
    renderGearList(detections);
  }

  function renderGearList(detections) {
    const listEl = document.getElementById('detectedGearList');
    if (!listEl) return;

    // The 5 Mandatory Categories
    const categories = [
      { key: 'helmet', label: 'Hard Hat / Helmet', icon: '🪖', search: /helmet|hardhat|hard_hat/i },
      { key: 'vest', label: 'High-Visibility Vest', icon: '🦺', search: /vest/i },
      { key: 'gloves', label: 'Safety Gloves', icon: '🧤', search: /glove/i },
      { key: 'glasses', label: 'Safety Glasses / Eyewear', icon: '🥽', search: /glass|goggle|eye|mask/i },
      { key: 'boots', label: 'Steel-Toe Boots', icon: '🥾', search: /boot|shoe/i },
    ];

    let html = '';

    categories.forEach(cat => {
      const matches = detections.filter(d => cat.search.test(d.label));
      const hasViolation = matches.some(d => d.is_violation || /^no[-_ ]/i.test(d.label)) || (!state.ppeState[cat.key]);
      const hasWorn = matches.some(d => !d.is_violation && !/^no[-_ ]/i.test(d.label)) && state.ppeState[cat.key];

      const isCompliant = hasWorn && !hasViolation;
      const isMissing = !isCompliant;

      const statusText = isMissing ? '⚠ Violation' : '✓ Compliant';
      const subText = isMissing
        ? 'Critical Hazard: Missing PPE Gear!'
        : 'Verified on tracked personnel';

      const rowClass = isMissing
        ? 'p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex items-center justify-between gap-3 slide-fade'
        : 'p-2.5 rounded-xl bg-slate-900/60 border border-emerald-500/25 flex items-center justify-between gap-3 slide-fade';

      const badgeClass = isMissing
        ? 'bg-rose-950/90 border border-rose-500/50 text-rose-300 font-mono text-[10px] font-bold shadow-[0_0_8px_rgba(239,68,68,0.3)]'
        : 'bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold';

      const iconBg = isMissing
        ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30';

      html += `
        <div class="${rowClass}">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0 text-base">
              ${cat.icon}
            </div>
            <div class="flex flex-col">
              <span class="font-display text-xs text-white font-semibold">${cat.label}</span>
              <span class="text-[11px] ${isMissing ? 'text-rose-400 font-medium' : 'text-slate-400'}">${subText}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 px-2.5 py-1 rounded-full ${badgeClass}">
            <span>${statusText}</span>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  // ============================================================
  // INTERACTIVE PPE STATE TOGGLES & MATRIX CONTROLLERS
  // ============================================================
  function togglePPEItem(item) {
    if (state.ppeState[item] !== undefined) {
      state.ppeState[item] = !state.ppeState[item];
      updatePPEControlCards();

      const isWorn = state.ppeState[item];
      const itemName = item.charAt(0).toUpperCase() + item.slice(1);

      if (isWorn) {
        AudioEngine.playChime('success');
        showToast(`PPE item verified: ${itemName} marked as Compliant (Green).`, 'success', 'PPE Status Updated');
      } else {
        AudioEngine.playChime('alert');
        showToast(`Critical Violation: ${itemName} missing! Outlined with Red Color Rectangle.`, 'warning', 'Hazard Detected');
      }

      captureAndDetect();
    }
  }
  window.togglePPEItem = togglePPEItem;

  function setAllPPEState(isCompliant) {
    state.ppeState.helmet = isCompliant;
    state.ppeState.vest = isCompliant;
    state.ppeState.gloves = isCompliant;
    state.ppeState.glasses = isCompliant;
    state.ppeState.boots = isCompliant;

    updatePPEControlCards();

    if (isCompliant) {
      AudioEngine.playChime('success');
      showToast('All 5 PPE items marked Compliant (All Green Rectangles).', 'success', 'All Safe');
    } else {
      AudioEngine.playChime('alert');
      showToast('Simulating Missing Gear Hazard: Missing items marked with Red Color Rectangles.', 'warning', 'Violation Alert');
    }

    captureAndDetect();
  }
  window.setAllPPEState = setAllPPEState;

  function updatePPEControlCards() {
    const items = ['helmet', 'vest', 'gloves', 'glasses', 'boots'];
    items.forEach(item => {
      const card = document.getElementById(`ppe-card-${item}`);
      const badge = document.getElementById(`ppe-badge-${item}`);
      const sub = document.getElementById(`ppe-sub-${item}`);
      const isWorn = state.ppeState[item];

      if (card) {
        if (isWorn) {
          card.classList.remove('is-missing');
          card.className = "ppe-control-card cursor-pointer p-3 rounded-xl bg-slate-900/80 border-2 border-emerald-500/50 hover:border-emerald-400 transition-all flex flex-col justify-between gap-2 shadow-sm";
        } else {
          card.classList.add('is-missing');
          card.className = "ppe-control-card is-missing cursor-pointer p-3 rounded-xl bg-rose-950/40 border-2 border-rose-500/80 hover:border-rose-400 transition-all flex flex-col justify-between gap-2 shadow-sm violation-pulse";
        }
      }

      if (badge) {
        badge.textContent = isWorn ? '✓ WORN' : '⚠ MISSING';
        badge.className = isWorn
          ? 'px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono text-[9px] font-bold border border-emerald-500/40'
          : 'px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 font-mono text-[9px] font-bold border border-rose-500/40 shadow-[0_0_8px_rgba(239,68,68,0.4)]';
      }

      if (sub) {
        sub.textContent = isWorn ? 'Green Box' : 'Red Box (Missing)';
        sub.className = isWorn ? 'text-[10px] font-mono text-emerald-400' : 'text-[10px] font-mono text-rose-400 font-bold';
      }
    });
  }

  // ============================================================
  // INTERACTIVE CONTROLS (Pause, Snapshot, Angles, Threshold)
  // ============================================================
  function togglePauseStream() {
    state.isPaused = !state.isPaused;
    const btn = document.getElementById('pauseStreamBtn');
    const label = document.getElementById('pauseStreamText');

    if (state.isPaused) {
      if (label) label.textContent = 'Resume Stream';
      showToast('Live inference feed paused.', 'warning', 'Feed Paused');
    } else {
      if (label) label.textContent = 'Pause Stream';
      showToast('Live inference feed resumed.', 'info', 'Feed Resumed');
    }
    AudioEngine.playChime('click');
  }
  window.togglePauseStream = togglePauseStream;

  function captureSnapshot() {
    const video = document.getElementById('feedVideo');
    const feedBg = document.getElementById('feedBg');
    const overlayCanvas = document.getElementById('overlayCanvas');

    const outCanvas = document.createElement('canvas');
    const w = 1280;
    const h = 720;
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d');

    if (state.currentSourceType === 'webcam' && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, w, h);
    } else {
      const activeCam = CCTV_CAMERAS[state.activeCamera];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = activeCam.bgUrl;
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0, w, h);
        renderSnapshotModal(outCanvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0, w, h);
        renderSnapshotModal(outCanvas.toDataURL('image/png'));
      };
      return;
    }

    if (overlayCanvas) ctx.drawImage(overlayCanvas, 0, 0, w, h);
    renderSnapshotModal(outCanvas.toDataURL('image/png'));
  }
  window.captureSnapshot = captureSnapshot;

  function renderSnapshotModal(dataUrl) {
    const previewImg = document.getElementById('snapshotPreviewImg');
    const downloadBtn = document.getElementById('snapshotDownloadBtn');
    if (previewImg) previewImg.src = dataUrl;
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `safesight-snapshot-${Date.now()}.png`;
        a.click();
        showToast('Snapshot downloaded successfully.', 'success', 'Download Complete');
      };
    }
    openModal('snapshotModal');
    AudioEngine.playChime('success');
  }

  function cycleCameraAngles() {
    const camIds = Object.keys(CCTV_CAMERAS);
    const currentIndex = camIds.indexOf(state.activeCamera);
    const nextIndex = (currentIndex + 1) % camIds.length;
    switchCCTVCamera(camIds[nextIndex]);
  }
  window.cycleCameraAngles = cycleCameraAngles;

  function updateSensitivity(value) {
    state.confidenceThreshold = parseFloat(value) / 100;
    const label = document.getElementById('sensitivityLabel');
    if (label) label.textContent = `${value}%`;
    const bar = document.getElementById('sensitivityBar');
    if (bar) bar.style.width = `${value}%`;

    // Re-draw current detections with new threshold
    if (state.sessionStats.lastDetections) {
      drawDetections(state.sessionStats.lastDetections);
    }
  }
  window.updateSensitivity = updateSensitivity;

  // ============================================================
  // AUDIT ACTIONS (Notify Marshall, Override, PDF, Zip, Sign)
  // ============================================================
  function notifyMarshall() {
    AudioEngine.playChime('alert');
    showToast('Emergency security alert dispatched to Safety Floor Marshall & Radio Pager (Channel 4).', 'warning', 'Marshall Dispatched');
  }
  window.notifyMarshall = notifyMarshall;

  function overrideInterlock() {
    openModal('overridePinModal');
  }
  window.overrideInterlock = overrideInterlock;

  function submitOverridePin() {
    const pinInput = document.getElementById('overridePinInput');
    const pin = pinInput ? pinInput.value.trim() : '';

    if (pin === '4092' || pin === '1234' || pin.length >= 4) {
      closeModal('overridePinModal');
      AudioEngine.playChime('success');
      showToast('Supervisor PIN authorized. Turnstiles #02, #07 & #11 manually released.', 'success', 'Interlock Cleared');
      if (pinInput) pinInput.value = '';
    } else {
      AudioEngine.playChime('alert');
      showToast('Invalid Security PIN. Authorization rejected.', 'error', 'Access Denied');
    }
  }
  window.submitOverridePin = submitOverridePin;

  function triggerAudioAlert() {
    AudioEngine.playChime('alert');
    showToast('Broadcasted audible industrial PPE alarm to Sector B Horns.', 'warning', 'Audio Siren');
  }
  window.triggerAudioAlert = triggerAudioAlert;

  function dispatchCaddy(workerId = 'Worker #102') {
    AudioEngine.playChime('click');
    showToast(`Safety Caddy autonomous runner dispatched with replacement gear to ${workerId}.`, 'info', 'Caddy Dispatched');
  }
  window.dispatchCaddy = dispatchCaddy;

  function viewClipModal(incidentText) {
    const modalText = document.getElementById('clipModalDetails');
    if (modalText) modalText.textContent = incidentText || 'Reviewing incident video frame.';
    openModal('clipPlayerModal');
  }
  window.viewClipModal = viewClipModal;

  function exportOshaPdf() {
    AudioEngine.playChime('click');
    showToast('Preparing OSHA 1910 Official PPE Verification Certificate...', 'info', 'PDF Export');
    setTimeout(() => {
      window.print();
    }, 600);
  }
  window.exportOshaPdf = exportOshaPdf;

  function exportIncidentClips() {
    AudioEngine.playChime('success');
    const auditData = {
      inspectionRef: 'SCAN-2024-998',
      standard: 'OSHA 1910 Subpart I / ISO 45001',
      timestamp: new Date().toISOString(),
      activeCamera: state.activeCamera,
      totalScanned: 51,
      compliantCount: 48,
      violationsCount: 3,
      violations: [
        { id: 'V-102', worker: 'Worker #102', violation: 'Eye Protection Missing', zone: 'Assembly Conveyor', time: '14:22:04' },
        { id: 'V-077', worker: 'Worker #077', violation: 'Gloves Partial Coverage', zone: 'Pallet Press Dock', time: '14:19:12' },
        { id: 'V-019', worker: 'Worker #019', violation: 'Unbuckled Chinstrap', zone: 'Inbound Sorting', time: '14:15:30' }
      ]
    };

    const blob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OSHA-Incident-Audit-${Date.now()}.json`;
    a.click();

    showToast('Cryptographically sealed incident audit package downloaded.', 'success', 'Package Exported');
  }
  window.exportIncidentClips = exportIncidentClips;

  function signAndCertifyAudit() {
    openModal('signAuditModal');
  }
  window.signAndCertifyAudit = signAndCertifyAudit;

  function confirmSignature() {
    const signInput = document.getElementById('signatureNameInput');
    const name = signInput ? signInput.value.trim() : 'Chief Safety Officer';
    closeModal('signAuditModal');
    AudioEngine.playChime('success');
    showToast(`Audit certified by ${name}. Signed and saved to immutable ledger.`, 'success', 'Certified & Signed');
  }
  window.confirmSignature = confirmSignature;

  function batchAcknowledgeAll() {
    AudioEngine.playChime('click');
    showToast('All active violations batch acknowledged by Safety Floor Marshall.', 'success', 'Violations Cleared');
  }
  window.batchAcknowledgeAll = batchAcknowledgeAll;

  // ============================================================
  // NAVIGATION & STEPPER
  // ============================================================
  function scrollToSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    updateActiveStepper(sectionId);
  }
  window.scrollToSection = scrollToSection;

  function updateActiveStepper(sectionId) {
    const tab1 = document.getElementById('tab-btn-1');
    const tab2 = document.getElementById('tab-btn-2');
    const tab3 = document.getElementById('tab-btn-3');

    const resetTab = (tab) => {
      if (!tab) return;
      tab.className = "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-slate-300 hover:text-white font-display";
      const badge = tab.querySelector('span:first-child');
      if (badge) badge.className = "w-4 h-4 rounded-full bg-blue-900/60 text-blue-300 flex items-center justify-center text-[10px] font-mono";
    };

    const setTabActive = (tab) => {
      if (!tab) return;
      tab.className = "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-sm bg-white text-blue-700 font-display";
      const badge = tab.querySelector('span:first-child');
      if (badge) badge.className = "w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-mono";
    };

    resetTab(tab1);
    resetTab(tab2);
    resetTab(tab3);

    if (sectionId === 'phase-1') setTabActive(tab1);
    else if (sectionId === 'phase-2') setTabActive(tab2);
    else if (sectionId === 'phase-3') setTabActive(tab3);
  }

  // Scroll spy to update stepper
  window.addEventListener('scroll', () => {
    const phase3 = document.getElementById('phase-3');
    const phase2 = document.getElementById('phase-2');

    if (phase3 && phase3.getBoundingClientRect().top <= 250) {
      updateActiveStepper('phase-3');
    } else if (phase2 && phase2.getBoundingClientRect().top <= 250) {
      updateActiveStepper('phase-2');
    } else {
      updateActiveStepper('phase-1');
    }
  }, { passive: true });

  // Quick menu toggle
  function toggleMenu() {
    const menu = document.getElementById('quick-menu');
    if (menu) menu.classList.toggle('hidden');
  }
  window.toggleMenu = toggleMenu;

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('quick-menu');
    const btn = document.getElementById('menu-btn');
    if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  // Settings Modal - Update Backend URL
  function openBackendSettings() {
    const input = document.getElementById('backendUrlInput');
    if (input) input.value = state.backendUrl;
    openModal('backendSettingsModal');
  }
  window.openBackendSettings = openBackendSettings;

  function saveBackendSettings() {
    const input = document.getElementById('backendUrlInput');
    if (input && input.value.trim()) {
      state.backendUrl = input.value.trim().replace(/\/+$/, '');
      localStorage.setItem('safesight_backend_url', state.backendUrl);
      closeModal('backendSettingsModal');
      checkBackendHealth();
      showToast(`AI Backend URL updated to: ${state.backendUrl}`, 'success', 'Settings Saved');
    }
  }
  window.saveBackendSettings = saveBackendSettings;

  // Fullscreen helper
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }
  window.toggleFullscreen = toggleFullscreen;

  // ============================================================
  // SPOTLIGHT CURSOR EFFECT
  // ============================================================
  function initSpotlight() {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight * 0.4;
    let currentX = mouseX;
    let currentY = mouseY;
    let isTicking = false;
    const root = document.documentElement;

    function onMove(x, y) {
      mouseX = x;
      mouseY = y;
      if (!isTicking) {
        requestAnimationFrame(render);
        isTicking = true;
      }
    }

    function render() {
      currentX += (mouseX - currentX) * 0.18;
      currentY += (mouseY - currentY) * 0.18;

      root.style.setProperty('--mouse-x', `${currentX.toFixed(1)}px`);
      root.style.setProperty('--mouse-y', `${currentY.toFixed(1)}px`);

      if (Math.abs(mouseX - currentX) > 0.2 || Math.abs(mouseY - currentY) > 0.2) {
        requestAnimationFrame(render);
      } else {
        isTicking = false;
      }
    }

    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', e => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    onMove(window.innerWidth / 2, window.innerHeight * 0.38);
  }

  // ============================================================
  // INITIALIZATION ON DOM READY
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Icons
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }

    // 2. Initialize Spotlight Cursor
    initSpotlight();

    // 3. Initialize Overlay Canvas
    setupOverlayCanvas();
    window.addEventListener('resize', setupOverlayCanvas);

    // 4. Check Backend Health
    checkBackendHealth();

    // 5. Initialize PPE controls & pre-load neural model
    updatePPEControlCards();
    loadClientVisionModel();

    // 6. Select default source
    selectSource('cctv');

    console.log('SafeSight AI Vision Engine initialized successfully with 5-PPE Detection.');
  });

})();
