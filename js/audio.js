// js/audio.js

let audioCtx = null;
let bgmSource = null; // 再生中の音楽ソースを保持する変数

export function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    return audioCtx;
}

export function getAudioContext() {
    return audioCtx;
}

// ★追加: 音楽ファイルを読み込む関数
export async function loadAudio(url) {
    if (!audioCtx) initAudio();
    
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBuffer;
}

// ★追加: 音楽を再生する関数
export function playMusic(buffer) {
    if (!audioCtx) return;

    // 前の曲が鳴ってたら止める
    stopMusic();

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    
    source.start(audioCtx.currentTime);
    
    // 停止用に保存しておく
    bgmSource = source;
}

// ★追加: 音楽を止める関数
export function stopMusic() {
    if (bgmSource) {
        bgmSource.stop();
        bgmSource = null;
    }
}

export function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'bgm_beat') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    }
}