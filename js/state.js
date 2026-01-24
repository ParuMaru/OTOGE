// js/state.js

// ローカルストレージからオフセット初期値を読み込み
const savedOffset = localStorage.getItem('rhythmGame_offset');
const initialOffset = savedOffset ? parseFloat(savedOffset) : 0.0;

export const state = {
    currentScene: 'title',
    selectedSong: null, 
    isPlaying: false,
    startTime: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    notes: [],
    audioCtx: null,
    laneLights: [0, 0, 0, 0],
    hitEffects: [],
    lastJudge: { text: '', time: -10, color: '#fff', timing: '' },
    judgeCounts: { perfect: 0, great: 0, good: 0, miss: 0 },
    speedMultiplier: 1.0,
    keyState: [false, false, false, false],
    greenNumber: 500,
    globalOffset: initialOffset,
    gameMode: 'normal',
    isAuto: false,
    isWaitingStart: false,
    musicBuffer: null,
    songOffset: 0,
    musicDuration: 0,
    currentBpm: 0,
    bpmEvents: [],

    calibData: {
        active: false,
        startTime: 0,
        beatCount: 0,
        diffs: [],
        nextBeatTime: 0,
        interval: 0.5,
        timerId: null
    }
};

// ゲーム開始時にリセットする関数
export function resetGameState() {
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
    state.hitEffects = [];
    state.lastJudge = { text: '', time: -10, color: '#fff', timing: '' };
    state.laneLights = [0, 0, 0, 0];
    state.isWaitingStart = true;
    state.isPlaying = true;
}