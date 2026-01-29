
let audioCtx = null;
let bgmSource = null;

export function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    return audioCtx;
}

export function getAudioContext() {
    return audioCtx;
}

export async function loadAudio(url) {
    if (!audioCtx) initAudio();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

export function playMusic(buffer) {
    if (!audioCtx) return;
    stopMusic();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(audioCtx.currentTime);
    bgmSource = source;
}

export function stopMusic() {
    if (bgmSource) {
        try {
            bgmSource.stop();
        } catch (e) {
            console.warn("Music stop error (ignored):", e);
        }
        bgmSource = null;
    }
}

//  引数 type に応じて音程を変える
export function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const t = audioCtx.currentTime;

    if (type === 'hit') {
        // ヒット音（高めのサイン波）
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start();
        osc.stop(t + 0.1);

    } else if (type === 'beat_low') {
        // （低いクリック音）
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, t); // 440Hz (A4)
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start();
        osc.stop(t + 0.05);

    } else if (type === 'beat_high') {
        // （高いアクセント音）
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t); // 880Hz (A5)
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); // 余韻少し長め
        osc.start();
        osc.stop(t + 0.1);
    }
}