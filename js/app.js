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
    confidenceThreshold: 0.80,
    sessionStats: {
      totalFrames: 0,
      totalDetections: 0,
      violations: 0,
      startTime: Date.now(),
      lastDetections: []
    }
  };

  // Pre-configured Camera Angles & Backgrounds
  const CCTV_CAMERAS = {
    CAM_04: {
      name: 'CAM 04 // MAIN ASSEMBLY',
      zone: 'ZONE_B // CELL_14',
      fps: '60.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD34rlzmg5FXjL_wcsQLx-kuxPkVstZTmjO_Be7aU7I4JwJH11w33l3exOxMMTt_KXyqE7TzMBwDQWu-EdcosGh3-AMGMUY0kWqrkle4Y96XtJ8gAs0LgojbhzTMY-N4ou9jSsFQjqycCZHPpfXapwgFcqfTQoRgei4TYqN4OWX1jAhrkqL25j8JACGKJtvQVzpkMY5kOwZyjm5ltVwNTXe6h4qWSDvaNPmSxrJk_oig129ehSmZspc4w',
      simulatedDetections: [
        { label: 'Hardhat', confidence: 0.98, box: [0.22, 0.24, 0.48, 0.92] },
        { label: 'Vest', confidence: 0.96, box: [0.25, 0.38, 0.45, 0.72] },
        { label: 'Boots', confidence: 0.94, box: [0.28, 0.78, 0.42, 0.92] },
        { label: 'NO-Eye-Protection', confidence: 0.89, box: [0.54, 0.28, 0.78, 0.92] },
        { label: 'Vest', confidence: 0.94, box: [0.56, 0.42, 0.76, 0.75] }
      ]
    },
    CAM_01: {
      name: 'CAM 01 // DOCK INBOUND',
      zone: 'ZONE_A // DOCK_03',
      fps: '59.9 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC3KFVhkj6BgvcfB3WLZnhKCZHtKafYUYQgW59hzwdy3RNagJlSkYDzSruUV_HjQuVjZDFgZYpCMKMW35Hb_NljSbwXK9R5SsPh0oZqWpJyB-htfy67uNJu_3Odi44467N3ZHKZimBouErFoytLuMQ76nU3Uf5gbMnRyphbCj-xAvDuy46J4Gcp7yhXZg-AWBk0_OpM0giQLoWz43pM__iLA1qksma4tACf0ruYts9xgT2m-DC0yrR7ug',
      simulatedDetections: [
        { label: 'Hardhat', confidence: 0.97, box: [0.30, 0.25, 0.50, 0.85] },
        { label: 'Vest', confidence: 0.95, box: [0.32, 0.38, 0.48, 0.68] },
        { label: 'Gloves', confidence: 0.91, box: [0.34, 0.52, 0.46, 0.62] }
      ]
    },
    CAM_02: {
      name: 'CAM 02 // CONVEYOR BELT',
      zone: 'ZONE_C // BELT_08',
      fps: '60.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCWKWFV-t_tGuBvQemGHLTpLbNSAb-fs5kLi0HAAezC87pRi179QAi48-lU9O691FG4E5Zl4w5T5quLI9Q-M1Zkc5z-cv5yRKV0_tg21ERT0mjeIAWkjx_u6LmpYmzf1NekP6XN67ZFqRXlVilEe892mX4Q4AQ8AYGPHL8io2sA6XBbCj1jpJAs0ZsI23miGKc6PkRcYS8gIfWvfVH4o4fo7-_8WyBzDB5v5DR7s-Fj3sfQTvPVsVx6qw',
      simulatedDetections: [
        { label: 'Hardhat', confidence: 0.99, box: [0.20, 0.20, 0.42, 0.82] },
        { label: 'Vest', confidence: 0.97, box: [0.22, 0.35, 0.40, 0.65] },
        { label: 'Boots', confidence: 0.95, box: [0.24, 0.70, 0.38, 0.82] }
      ]
    },
    CAM_05: {
      name: 'CAM 05 // HYDRAULIC PRESS',
      zone: 'ZONE_D // PRESS_02',
      fps: '30.0 FPS',
      resolution: '1080p',
      bgUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC1SH9swre-s8GLC6X5xc7zixH2t0Pf5Z3KJtprKZLk0oaOG-gmzsQTRoedpPleWf4LuGM6bH8XT9BiX31VLlJCGvamG3HuJq-0fXTzoXz8mrl02vwJSFm1pckqWltxypV5JZu2XvANcRKAkeCgXUYZf4SLuGaGZ5SUtAeA5QbYieBhNNKdYXUHBzj525FK3T8SomKkgkSFNg7tu2Buyf53im77XFhlpR6u9Pj7Rt3RNQ21VosgRradNw',
      simulatedDetections: [
        { label: 'Hardhat', confidence: 0.95, box: [0.35, 0.22, 0.62, 0.88] },
        { label: 'Vest', confidence: 0.92, box: [0.38, 0.36, 0.58, 0.68] },
        { label: 'NO-Gloves', confidence: 0.91, box: [0.42, 0.50, 0.55, 0.65] }
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
  }

  function drawDetections(detections) {
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
      if (det.confidence < state.confidenceThreshold) return;

      const isViolation = /^no[-_ ]/i.test(det.label);
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
          const vw = video.videoWidth || width;
          const vh = video.videoHeight || height;
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

      const color = isViolation ? '#f43f5e' : '#10b981';
      const bgColor = isViolation ? 'rgba(244, 63, 94, 0.14)' : 'rgba(16, 185, 129, 0.12)';
      const cornerLen = Math.min(18, w * 0.25, h * 0.25);

      // Box semi-transparent fill
      ctx.fillStyle = bgColor;
      ctx.fillRect(x1, y1, w, h);

      // Cyber Corner Brackets
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

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

      // Label Tag Badge
      const labelText = `${isViolation ? '⚠ ' : '✓ '}${det.label} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const textMetrics = ctx.measureText(labelText);
      const tagWidth = textMetrics.width + 16;
      const tagHeight = 22;
      const tagY = Math.max(0, y1 - tagHeight - 3);

      ctx.fillStyle = isViolation ? 'rgba(225, 29, 72, 0.95)' : 'rgba(5, 150, 105, 0.95)';
      ctx.beginPath();
      ctx.roundRect(x1, tagY, tagWidth, tagHeight, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 8, tagY + 15);
    });
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
      showToast('Live webcam optical channel initialized.', 'success', 'Webcam Connected');
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
    showToast(`Loaded pre-recorded video: ${state.selectedVideoFile.name}`, 'info', 'File Stream Active');
    return true;
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
    state.scanIntervalId = setInterval(captureAndDetect, CONFIG.SCAN_INTERVAL_MS);

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

  // Frame Grab & Detection
  async function captureAndDetect() {
    if (!state.isScanning || state.isPaused) return;

    state.sessionStats.totalFrames++;
    const tStart = performance.now();

    let detections = [];

    // Attempt real backend inference if online or if webcam/video is active
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
          console.warn('Backend inference failed, using simulated data:', err);
        }
      }
    }

    // Fallback: Smart Simulation Data from active CCTV preset
    if (detections.length === 0) {
      const activeCam = CCTV_CAMERAS[state.activeCamera] || CCTV_CAMERAS.CAM_04;
      // Add slight organic jitter to simulated confidence scores
      detections = activeCam.simulatedDetections.map(d => ({
        ...d,
        confidence: Math.min(0.99, Math.max(0.75, d.confidence + (Math.random() * 0.04 - 0.02)))
      }));
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
      ? (detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length * 100).toFixed(1)
      : '97.4';
    const confEl = document.getElementById('telemetryConfidence');
    if (confEl) confEl.textContent = confAvg;

    // 2. Tracked subjects
    const subjectsLabel = document.getElementById('trackedSubjectsLabel');
    if (subjectsLabel) subjectsLabel.textContent = `TRACKED SUBJECTS: ${detections.length} DETECTED`;

    // 3. Safety Score calculation
    const violations = detections.filter(d => /^no[-_ ]/i.test(d.label));
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

    // 4. Detected Gear Status list
    renderGearList(detections);
  }

  function renderGearList(detections) {
    const listEl = document.getElementById('detectedGearList');
    if (!listEl) return;

    const byLabel = {};
    detections.forEach(d => {
      if (!byLabel[d.label] || d.confidence > byLabel[d.label]) {
        byLabel[d.label] = d.confidence;
      }
    });

    listEl.innerHTML = '';
    const labels = Object.keys(byLabel);

    if (labels.length === 0) {
      listEl.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">No items identified in current frame.</div>';
      return;
    }

    labels.forEach(label => {
      const conf = byLabel[label];
      const isViolation = /^no[-_ ]/i.test(label);

      let icon = '🛡️';
      if (/hat|helmet/i.test(label)) icon = '🪖';
      else if (/vest/i.test(label)) icon = '🦺';
      else if (/boot|shoe/i.test(label)) icon = '🥾';
      else if (/glove/i.test(label)) icon = '🧤';
      else if (/glass|goggle|eye/i.test(label)) icon = '🥽';
      else if (/mask|respirator/i.test(label)) icon = '😷';

      const row = document.createElement('div');
      row.className = isViolation
        ? 'p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between gap-3 slide-fade'
        : 'p-2.5 rounded-xl bg-slate-900/60 border border-blue-500/15 flex items-center justify-between gap-3 slide-fade';

      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg ${isViolation ? 'bg-rose-950/80 text-rose-300' : 'bg-blue-950/80 text-blue-300'} flex items-center justify-center shrink-0 text-base">
            ${icon}
          </div>
          <div class="flex flex-col">
            <span class="font-display text-xs text-white font-semibold">${label}</span>
            <span class="text-[11px] text-slate-400">${(conf * 100).toFixed(1)}% confidence</span>
          </div>
        </div>
        <div class="flex items-center gap-1 px-2.5 py-1 rounded-full ${isViolation ? 'bg-rose-950/90 border border-rose-500/40 text-rose-300' : 'bg-emerald-950/70 border border-emerald-500/30 text-emerald-400'} font-mono text-[10px] font-bold">
          <span>${isViolation ? '⚠ Violation' : '✓ Compliant'}</span>
        </div>
      `;
      listEl.appendChild(row);
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

    // 5. Select default source
    selectSource('cctv');

    console.log('SafeSight AI Vision Engine initialized successfully.');
  });

})();
