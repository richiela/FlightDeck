/**
 * Screen keep-awake for Control / Viewer kiosk tabs.
 * Call FlightDeckWakeLock.setDesired(true|false) from page logic.
 *
 * Primary: Screen Wake Lock API (Chrome / modern Safari).
 * Fallback: muted looping video (iPad / older iOS Safari).
 * No-op in mock mode (port 4000) so the dev box can sleep.
 *
 * Dispatches window event "flightdeck-wakelock" with
 * { desired, held, mode: 'none'|'wakelock'|'video', needsGesture, supported }.
 */
(function keepScreenAwake() {
    const SILENT_VIDEO_SRC = '/assets/app/keep-awake-silent.mp4';

    const api = {
        setDesired() {},
        isDesired() { return false; },
        isHeld() { return false; },
        needsGesture() { return false; },
        getMode() { return 'none'; },
        supported: false
    };
    window.FlightDeckWakeLock = api;

    if (typeof location !== 'undefined' && location.port === '4000') {
        return;
    }

    const hasWakeLockApi = !!(
        typeof navigator !== 'undefined'
        && navigator.wakeLock
        && typeof navigator.wakeLock.request === 'function'
    );

    let desired = false;
    let wakeLock = null;
    let videoEl = null;
    let mode = 'none'; // none | wakelock | video
    let retryTimer = null;
    let gotGesture = false;
    let gestureArmed = false;

    function emit() {
        const held = !!(wakeLock || (videoEl && !videoEl.paused));
        const detail = {
            desired,
            held,
            mode,
            needsGesture: desired && !held && !gotGesture,
            supported: true
        };
        try {
            window.dispatchEvent(new CustomEvent('flightdeck-wakelock', { detail }));
        } catch (_) {}
        return detail;
    }

    function clearRetry() {
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
    }

    function scheduleRetry(ms) {
        if (!desired || retryTimer) return;
        retryTimer = setTimeout(() => {
            retryTimer = null;
            activate();
        }, ms);
    }

    function ensureVideo() {
        if (videoEl) return videoEl;
        const v = document.createElement('video');
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.muted = true;
        v.defaultMuted = true;
        v.loop = true;
        v.autoplay = false;
        v.preload = 'auto';
        v.playsInline = true;
        v.src = SILENT_VIDEO_SRC;
        v.style.cssText = [
            'position:fixed',
            'width:1px',
            'height:1px',
            'left:-10px',
            'top:-10px',
            'opacity:0',
            'pointer-events:none',
            'z-index:-1'
        ].join(';');
        (document.body || document.documentElement).appendChild(v);
        videoEl = v;
        return v;
    }

    async function stopVideo() {
        if (!videoEl) return;
        try {
            videoEl.pause();
            videoEl.removeAttribute('src');
            videoEl.load();
        } catch (_) {}
        try {
            if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
        } catch (_) {}
        videoEl = null;
        if (mode === 'video') mode = 'none';
    }

    async function startVideo() {
        const v = ensureVideo();
        if (!v.src) v.src = SILENT_VIDEO_SRC;
        try {
            v.muted = true;
            const p = v.play();
            if (p && typeof p.then === 'function') await p;
            mode = 'video';
            gotGesture = true;
            emit();
            return true;
        } catch (_) {
            scheduleRetry(3000);
            emit();
            return false;
        }
    }

    async function releaseWakeLock() {
        if (!wakeLock) return;
        try {
            await wakeLock.release();
        } catch (_) { /* already released */ }
        wakeLock = null;
        if (mode === 'wakelock') mode = 'none';
    }

    async function requestWakeLock() {
        if (!hasWakeLockApi) return false;
        if (document.visibilityState !== 'visible') return false;
        if (wakeLock) return true;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            mode = 'wakelock';
            gotGesture = true;
            wakeLock.addEventListener('release', () => {
                wakeLock = null;
                if (mode === 'wakelock') mode = 'none';
                emit();
                if (desired && document.visibilityState === 'visible') {
                    scheduleRetry(1500);
                }
            });
            emit();
            return true;
        } catch (_) {
            return false;
        }
    }

    async function activate() {
        clearRetry();
        if (!desired) return;
        if (document.visibilityState !== 'visible') {
            emit();
            return;
        }

        // Prefer native wake lock when available
        if (hasWakeLockApi) {
            const ok = await requestWakeLock();
            if (ok) {
                await stopVideo();
                mode = 'wakelock';
                emit();
                return;
            }
        }

        // iPad / unsupported / denied → silent video loop
        const vidOk = await startVideo();
        if (!vidOk) {
            mode = 'none';
            emit();
            scheduleRetry(5000);
        }
    }

    async function deactivate() {
        clearRetry();
        await releaseWakeLock();
        await stopVideo();
        mode = 'none';
        emit();
    }

    function armGesture() {
        if (gestureArmed) return;
        gestureArmed = true;
        const onGesture = () => {
            gotGesture = true;
            if (desired) activate();
            emit();
        };
        window.addEventListener('pointerdown', onGesture, { passive: true });
        window.addEventListener('touchstart', onGesture, { passive: true });
        window.addEventListener('keydown', onGesture);
    }

    api.supported = true;
    api.isDesired = () => desired;
    api.isHeld = () => !!(wakeLock || (videoEl && !videoEl.paused));
    api.needsGesture = () => desired && !api.isHeld() && !gotGesture;
    api.getMode = () => mode;
    api.setDesired = (on) => {
        const next = !!on;
        if (next === desired) {
            if (next && !api.isHeld()) activate();
            else emit();
            return;
        }
        desired = next;
        if (desired) {
            armGesture();
            activate();
        } else {
            deactivate();
        }
        emit();
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && desired) activate();
        else if (document.visibilityState !== 'visible') {
            // OS may release wake lock; video usually pauses — clear handles
            wakeLock = null;
            if (videoEl && videoEl.paused && mode === 'video') mode = 'none';
            emit();
        }
    });

    armGesture();
    emit();
})();
