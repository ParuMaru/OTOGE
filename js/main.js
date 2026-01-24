// js/main.js

import { CONFIG, } from './constants.js'; 
import { initAudio, playSound, loadAudio, playMusic, stopMusic } from './audio.js';
import { initRenderer, renderGame } from './renderer.js';

// スマホ向けにレーン幅をCanvas幅(400px)いっぱいに広げる
CONFIG.LANE_WIDTH = 100;

// DOM要素の取得
const scenes = {
    title: document.getElementById('scene-title'),
    select: document.getElementById('scene-select'),
    game: document.getElementById('scene-game'),
    result: document.getElementById('scene-result'),
    calibration: document.getElementById('scene-calibration')
};

const uiScore = document.getElementById('score');

let globalSongList = [];

// ローカルストレージから設定を読み込む
const savedOffset = localStorage.getItem('rhythmGame_offset');
const initialOffset = savedOffset ? parseFloat(savedOffset) : 0.0;

// ゲームの状態管理
const state = {
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
    
    // ★追加: スタート待機用フラグと一時保存データ
    isWaitingStart: false,
    musicBuffer: null,
    songOffset: 0,

    // キャリブレーション用変数
    calibData: {
        active: false,
        startTime: 0,
        beatCount: 0,
        diffs: [],
        nextBeatTime: 0,
        timerId: null
    }
};

// 初期化
const canvas = document.getElementById('gameCanvas');
initRenderer(canvas);
const ctx = canvas.getContext('2d'); // 文字描画用にコンテキスト取得

// --- ヘルパー関数: 停止時間を考慮した実質的な差分時間を計算 ---
function getEffectiveDiff(currentTime, targetTime) {
    let rawDiff = targetTime - currentTime;
    if (rawDiff <= 0) return rawDiff;

    if (state.bpmEvents) {
        for (let i = 0; i < state.bpmEvents.length - 1; i++) {
            const evt = state.bpmEvents[i];
            const nextEvt = state.bpmEvents[i+1];
            
            if (evt.bpm === 0) {
                const overlapStart = Math.max(currentTime, evt.time);
                const overlapEnd = Math.min(targetTime, nextEvt.time);
                
                if (overlapEnd > overlapStart) {
                    const overlap = overlapEnd - overlapStart;
                    rawDiff -= overlap;
                }
            }
        }
    }
    return rawDiff;
}


// --- シーン管理関数 ---

function toTitle() {
    switchScene('title');
    fetch('assets/song_list.json')
        .then(res => res.json())
        .then(data => { globalSongList = data; })
        .catch(err => { console.error("Song list load failed:", err); });

    const btnBeginner = document.getElementById('btn-beginner');
    const btnNormal = document.getElementById('btn-normal');

    if (btnBeginner) {
        btnBeginner.onclick = () => {
            state.audioCtx = initAudio(); 
            state.gameMode = 'beginner'; 
            toSelect();
        };
    }
    if (btnNormal) {
        btnNormal.onclick = () => {
            state.audioCtx = initAudio(); 
            state.gameMode = 'normal';   
            toSelect();
        };
    }
}

function toSelect() {
    state.isPlaying = false;
    state.calibData.active = false;
    if(state.calibData.timerId) clearTimeout(state.calibData.timerId);
    stopMusic();
    switchScene('select');
    
    const storageKey = `rhythmGame_speed_${state.gameMode}`;
    const savedSpeed = localStorage.getItem(storageKey);

    if (savedSpeed) {
        state.greenNumber = parseInt(savedSpeed);
    } else {
        if (state.gameMode === 'beginner') {
            state.greenNumber = 800; 
        } else {
            state.greenNumber = 500; 
        }
    }

    const settingPanel = document.getElementById('setting-panel');
    settingPanel.innerHTML = ''; 

    // --- ラベル ---
    const labelContainer = document.createElement('div');
    labelContainer.style.marginBottom = '10px';
    labelContainer.style.display = 'flex';
    labelContainer.style.justifyContent = 'space-around';
    
    const speedLabel = document.createElement('div');
    speedLabel.style.fontSize = '1.2rem';
    speedLabel.style.fontFamily = 'monospace';
    speedLabel.style.fontWeight = 'bold';

    const offsetLabel = document.createElement('div');
    offsetLabel.style.fontSize = '1.2rem';
    offsetLabel.style.fontFamily = 'monospace';
    offsetLabel.style.fontWeight = 'bold';
    
    const updateLabels = () => {
        speedLabel.innerHTML = `SPEED: <span style="color:#0f0">${state.greenNumber}</span>`;
        const ms = Math.round(state.globalOffset * 1000);
        const sign = ms > 0 ? '+' : '';
        const color = ms === 0 ? '#fff' : (ms > 0 ? '#ff8844' : '#44ccff');
        offsetLabel.innerHTML = `OFFSET: <span style="color:${color}">${sign}${ms}ms</span>`;
    };
    updateLabels();
    
    labelContainer.appendChild(speedLabel);
    labelContainer.appendChild(offsetLabel);
    settingPanel.appendChild(labelContainer);

    // --- SPEEDボタン ---
    const speedContainer = document.createElement('div');
    speedContainer.className = 'setting-buttons';
    speedContainer.style.marginBottom = '10px';
    speedContainer.innerHTML = '<div style="width:100%; font-size:0.8rem; color:#aaa; margin-bottom:2px;">SPEED SETTING</div>';

    const changeSpeed = (amount) => {
        let newSpeed = state.greenNumber + amount;
        newSpeed = Math.max(100, Math.min(2000, newSpeed));
        state.greenNumber = newSpeed;
        localStorage.setItem(storageKey, state.greenNumber);
        updateLabels();
    };

    const createBtn = (text, amount, className) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.className = `setting-btn ${className}`;
        btn.onclick = () => changeSpeed(amount);
        return btn;
    };

    speedContainer.appendChild(createBtn('<< -100', -100, 'btn-fast'));
    speedContainer.appendChild(createBtn('< -10', -10, 'btn-fast'));
    speedContainer.appendChild(createBtn('+10 >', 10, 'btn-slow'));
    speedContainer.appendChild(createBtn('+100 >>', 100, 'btn-slow'));

    // --- OFFSET & AUTO ボタン ---
    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'setting-buttons';
    offsetContainer.innerHTML = '<div style="width:100%; font-size:0.8rem; color:#aaa; margin-bottom:2px;">JUDGE OFFSET & AUTO</div>';

    const saveOffset = () => {
        state.globalOffset = Math.round(state.globalOffset * 1000) / 1000;
        localStorage.setItem('rhythmGame_offset', state.globalOffset);
    };

    const createOffsetBtn = (text, msAmount, className) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.className = `setting-btn ${className}`;
        btn.onclick = () => { 
            state.globalOffset += msAmount; 
            saveOffset(); 
            updateLabels(); 
        };
        return btn;
    };

    offsetContainer.appendChild(createOffsetBtn('<< -10', -0.01, 'btn-fast'));
    offsetContainer.appendChild(createOffsetBtn('< -1', -0.001, ''));
    offsetContainer.appendChild(createOffsetBtn('+1 >', 0.001, ''));
    offsetContainer.appendChild(createOffsetBtn('+10 >>', 0.01, 'btn-slow'));
    
    // キャリブレーションボタン
    const autoAdjBtn = document.createElement('button');
    autoAdjBtn.innerText = 'ADJUST';
    autoAdjBtn.className = 'setting-btn';
    autoAdjBtn.style.borderColor = '#0f0';
    autoAdjBtn.style.color = '#0f0';
    autoAdjBtn.style.marginLeft = '10px';
    autoAdjBtn.onclick = () => toCalibration();
    offsetContainer.appendChild(autoAdjBtn);

    // オートプレイボタン
    const autoPlayBtn = document.createElement('button');
    autoPlayBtn.className = 'setting-btn';
    autoPlayBtn.style.marginLeft = '5px';
    const updateAutoBtn = () => {
        autoPlayBtn.innerText = state.isAuto ? 'AUTO: ON' : 'AUTO: OFF';
        autoPlayBtn.style.borderColor = state.isAuto ? '#ff0' : '#888';
        autoPlayBtn.style.color = state.isAuto ? '#ff0' : '#888';
    };
    updateAutoBtn();
    autoPlayBtn.onclick = () => {
        state.isAuto = !state.isAuto;
        updateAutoBtn();
    };
    offsetContainer.appendChild(autoPlayBtn);

    settingPanel.appendChild(speedContainer);
    settingPanel.appendChild(document.createElement('hr')); 
    settingPanel.appendChild(offsetContainer);

    // --- リスト ---
    const listContainer = document.getElementById('song-list');
    listContainer.innerHTML = ''; 
    
    globalSongList.forEach(song => {
        let diffs = song.difficulties || ['Hard'];
        
        if (state.gameMode === 'beginner') {
            const allowed = ['Beginner', 'Easy', 'Medium', 'Hard'];
            diffs = diffs.filter(d => allowed.includes(d));
            if (diffs.length === 0) return;
        }

        const songRow = document.createElement('div');
        songRow.className = 'song-row';
        
        const titleDiv = document.createElement('div');
        titleDiv.innerText = song.title;
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.marginBottom = '10px';
        titleDiv.style.fontSize = '1.2rem';
        songRow.appendChild(titleDiv);

        const diffContainer = document.createElement('div');
        diffContainer.className = 'difficulty-container';
        
        diffs.forEach(diffName => {
            const btn = document.createElement('button');
            btn.className = 'song-btn';
            btn.style.flex = '1';
            btn.innerText = diffName; 
            btn.onclick = () => startGame(song, diffName);
            diffContainer.appendChild(btn);
        });
        songRow.appendChild(diffContainer);
        listContainer.appendChild(songRow);
    });
}

function toCalibration() {
    switchScene('calibration');
    const statusDiv = document.getElementById('calib-status');
    const resultDiv = document.getElementById('calib-result');
    statusDiv.innerText = "READY...";
    statusDiv.style.color = "white";
    resultDiv.innerText = "";
    
    state.calibData = {
        active: true,
        beatCount: 0, 
        diffs: [],    
        nextBeatTime: 0,
        interval: 0.5, 
        timerId: null
    };

    setTimeout(() => {
        if(state.currentScene !== 'calibration') return;
        state.calibData.startTime = state.audioCtx.currentTime;
        state.calibData.nextBeatTime = state.calibData.startTime + 1.0; 
        runCalibrationLoop();
    }, 1000);
}

function runCalibrationLoop() {
    if (state.currentScene !== 'calibration') return;

    const data = state.calibData;
    const BEAT_TOTAL = 20; 
    
    if (data.beatCount < BEAT_TOTAL) {
        const isAccent = (data.beatCount % 4 === 3);
        
        if (isAccent) {
            playSound('beat_high'); 
        } else {
            playSound('beat_low');  
        }
        
        const statusDiv = document.getElementById('calib-status');
        if (data.beatCount < 4) {
            statusDiv.innerText = "LISTEN...";
            statusDiv.style.color = "#888";
        } else {
            statusDiv.innerText = "TAP!"; 
            statusDiv.style.color = isAccent ? "#ff0" : "#0ff";
        }
        
        data.nextBeatTime += data.interval;
        data.beatCount++;
        
        const delay = (data.nextBeatTime - state.audioCtx.currentTime) * 1000;
        data.timerId = setTimeout(runCalibrationLoop, Math.max(0, delay));

    } else {
        finishCalibration();
    }
}

function handleCalibrationTap() {
    if (!state.calibData.active) return;
    const data = state.calibData;
    
    const tapTime = state.audioCtx.currentTime;
    const lastBeatIndex = data.beatCount - 1;
    const targetTime = (data.startTime + 1.0) + (lastBeatIndex * data.interval);
    const diff = tapTime - targetTime;
    
    if (Math.abs(diff) > 0.25) return;
    if (lastBeatIndex < 4) return;
    
    data.diffs.push(diff);
    
    const statusDiv = document.getElementById('calib-status');
    statusDiv.style.opacity = 0.5;
    setTimeout(() => statusDiv.style.opacity = 1, 50);
}

function finishCalibration() {
    state.calibData.active = false;
    const diffs = state.calibData.diffs;
    const statusDiv = document.getElementById('calib-status');
    const resultDiv = document.getElementById('calib-result');
    
    if (diffs.length === 0) {
        statusDiv.innerText = "FAILED";
        setTimeout(toSelect, 1500);
        return;
    }
    
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    const median = diffs.length % 2 !== 0 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
    
    state.globalOffset = median;
    state.globalOffset = Math.round(state.globalOffset * 1000) / 1000;
    localStorage.setItem('rhythmGame_offset', state.globalOffset);
    
    statusDiv.innerText = "COMPLETE!";
    const ms = Math.round(median * 1000);
    const sign = ms > 0 ? '+' : '';
    resultDiv.innerText = `OFFSET SET TO: ${sign}${ms}ms`;
    
    setTimeout(toSelect, 2000);
}


async function startGame(songData, difficulty = 'Hard') {
    state.selectedSong = songData; 
    const overlay = document.getElementById('scene-select');
    const originalText = overlay.innerHTML;
    overlay.innerHTML = '<h1 style="color:white">LOADING DATA...</h1>';

    try {
        const base = `${CONFIG.SONG_BASE_PATH}${songData.folder}/`;
        
        const musicFilename = songData.audioFile || `${songData.folder}.${songData.format || 'mp3'}`;
        const musicUrl = base + musicFilename;

        const chartUrl = base + `${songData.folder}.json`;

        const [musicBuffer, chartData] = await Promise.all([
            loadAudio(musicUrl),
            fetch(chartUrl).then(res => res.json()) 
        ]);
        
        if (chartData.bpmEvents) {
            let accumulatedY = 0;
            for (let i = 0; i < chartData.bpmEvents.length; i++) {
                const evt = chartData.bpmEvents[i];
                const nextEvt = chartData.bpmEvents[i + 1];
                evt.y = accumulatedY;
                if (nextEvt) {
                    const duration = nextEvt.time - evt.time;
                    accumulatedY += duration * evt.bpm;
                }
            }
            state.bpmEvents = chartData.bpmEvents;
        } else {
            state.bpmEvents = [{ time: 0, bpm: state.currentBpm || 150, y: 0 }];
        }

        let targetNotes = chartData[difficulty];
        if (!targetNotes) {
            console.warn(`Difficulty ${difficulty} not found. Using first available.`);
            targetNotes = Object.values(chartData)[0];
        }

        const songBpm = chartData.bpm || songData.bpm;
        // ★修正: songOffsetをstateに保存して、開始時に使うようにする
        state.songOffset = (chartData.offset !== undefined) ? chartData.offset : (songData.offset || 0);
        state.currentBpm = songBpm;
        
        let maxBpm = songData.bpm || 150; 
        if (chartData.bpmEvents && chartData.bpmEvents.length > 0) {
            chartData.bpmEvents.forEach(evt => {
                if (evt.bpm > maxBpm) maxBpm = evt.bpm;
            });
        }

        const baseScale = 4.0;
        const judgeY = CONFIG.JUDGE_LINE_Y; 
        const targetBpm = maxBpm > 0 ? maxBpm : 150;
        state.speedMultiplier = (judgeY * 1000) / (state.greenNumber * targetBpm * baseScale);

        state.score = 0;
        state.combo = 0;
        state.maxCombo = 0;
        state.judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
        state.hitEffects = [];
        state.lastJudge = { text: '', time: -10, color: '#fff', timing: '' };
        
        state.notes = targetNotes.map(n => ({ ...n, hit: false, visible: true }));

        // ★修正: ここでは再生せず、待機モードにする
        state.musicBuffer = musicBuffer;
        state.isWaitingStart = true;
        state.isPlaying = true; // ループは回す（描画のため）

        overlay.innerHTML = originalText;
        switchScene('game');
        
        if (uiScore) {
            const mult = state.speedMultiplier || 1.0;
            const actual = Math.round(CONFIG.NOTE_SPEED * mult);
            uiScore.innerHTML = `SCORE: 0<br><span style="font-size:0.7em; color:#aaa">SPD: ${actual} (x${mult.toFixed(1)})</span>`;
        }
        
        state.musicDuration = musicBuffer.duration;
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("ロードエラー:", error);
        alert(`エラーが発生しました:\n${error.message}\n\nコンソール(F12)も確認してください。`);
        overlay.innerHTML = originalText;
    }
}

// ★追加: 実際のゲーム開始処理（タップ後に呼ばれる）
function startRealGame() {
    if (!state.isWaitingStart) return;

    playMusic(state.musicBuffer);
    state.startTime = state.audioCtx.currentTime - state.songOffset;
    state.isWaitingStart = false; // 待機解除
}

function finishGame() {
    state.isPlaying = false;
    switchScene('result');

    const totalNotes = state.notes.length; 
    const maxScore = totalNotes * 1000; 
    
    let rank = 'C';
    if (state.score >= maxScore*0.85) rank = 'S';
    else if (state.score >= maxScore*0.7) rank = 'A';
    else if (state.score >= maxScore*0.6) rank = 'B';

    const isFullCombo = state.judgeCounts.miss === 0 && totalNotes > 0;
    const isAllPerfect = isFullCombo && state.judgeCounts.great === 0 && state.judgeCounts.good === 0;

    let specialMessage = '';
    const animStyle = `animation: blink 0.3s infinite alternate;`;

    if (isAllPerfect) {
        specialMessage = `<div style="color: #ffd700; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #ffd700; ${animStyle}">ALL PERFECT!!</div>`;
    } else if (isFullCombo) {
        specialMessage = `<div style="color: #00ffcc; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #00ffcc;">FULL COMBO!!</div>`;
    }

    if (!document.getElementById('anim-style')) {
        const style = document.createElement('style');
        style.id = 'anim-style';
        style.innerHTML = `@keyframes blink { from { opacity: 1; transform: scale(1); } to { opacity: 0.8; transform: scale(1.05); } }`;
        document.head.appendChild(style);
    }

    scenes.result.innerHTML = `
        <h1 style="color: #ff0055; margin-bottom: 10px;">FINISH!</h1>
        <h2 style="color: #fff">${state.selectedSong.title}</h2>
        ${specialMessage}
        <div style="font-size: 3rem; color: cyan; font-weight: bold; text-shadow: 0 0 20px cyan;">
            RANK ${rank}
        </div>
        <div style="margin: 20px 0; font-size: 1.5rem;">
            SCORE: ${state.score} <br>
            <span style="font-size: 1rem; color: #aaa">MAX COMBO: ${state.maxCombo}</span>
        </div>
        <div style="
            display: grid; grid-template-columns: 1fr 1fr; gap: 10px 30px; 
            text-align: left; background: rgba(0,0,0,0.5); 
            padding: 20px; border-radius: 10px; border: 1px solid #444;
        ">
            <div style="color: #ffd700">PERFECT</div><div style="text-align: right">${state.judgeCounts.perfect}</div>
            <div style="color: #0f0">GREAT</div><div style="text-align: right">${state.judgeCounts.great}</div>
            <div style="color: #00fffa">GOOD</div><div style="text-align: right">${state.judgeCounts.good}</div>
            <div style="color: #888">MISS</div><div style="text-align: right">${state.judgeCounts.miss}</div>
        </div>
        <div style="margin-top: 30px; display: flex; gap: 20px;">
            <button id="btn-retry" class="song-btn" style="width: auto; text-align: center;">RETRY</button>
            <button id="btn-select" class="song-btn" style="width: auto; text-align: center;">SELECT SONG</button>
        </div>
    `;

    document.getElementById('btn-retry').onclick = () => startGame(state.selectedSong);
    document.getElementById('btn-select').onclick = () => toSelect();
}

function switchScene(sceneName) {
    state.currentScene = sceneName;
    Object.values(scenes).forEach(el => { if(el) el.style.display = 'none'; });
    scenes[sceneName].style.display = 'flex';
}

// --- 入力ロジック (分岐あり) ---

// 共通入力ロジック（分岐）
function handleInputDown(laneIndex) {
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
        return;
    }
    
    // ★追加: 待機中ならゲーム開始して終了
    if (state.currentScene === 'game' && state.isWaitingStart) {
        startRealGame();
        return;
    }
    
    if (state.currentScene !== 'game') return;
    if (!state.isPlaying || laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;
    if (state.keyState[laneIndex]) return;

    state.laneLights[laneIndex] = 0.3;
    state.keyState[laneIndex] = true;

    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;

    const targetNote = state.notes
        .filter(n => n.lane === laneIndex && !n.hit && n.visible)
        .sort((a, b) => a.time - b.time)[0];

    if (targetNote) {
        const effectiveDiff = getEffectiveDiff(currentSongTime, targetNote.time);
        const diffAbs = Math.abs(effectiveDiff);

        if (diffAbs <= CONFIG.JUDGE_WINDOW.GOOD) {
            if (targetNote.duration > 0) {
                targetNote.isHolding = true; 
                let judge = 'GOOD';
                if (diffAbs <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
                else if (diffAbs <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
                handleJudge(judge, effectiveDiff > 0 ? 'FAST' : 'SLOW');
                playSound('hit');
                createHitEffect(laneIndex);
            } else {
                targetNote.hit = true;
                targetNote.visible = false;
                let judge = 'GOOD';
                if (diffAbs <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
                else if (diffAbs <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
                handleJudge(judge, effectiveDiff > 0 ? 'FAST' : 'SLOW');
                playSound('hit');
                createHitEffect(laneIndex);
            }
        }
    }
}

function handleInputUp(laneIndex) {
    if (state.currentScene !== 'game') return;

    if (laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;
    state.keyState[laneIndex] = false;

    const holdingNote = state.notes.find(n => n.lane === laneIndex && n.isHolding && !n.hit);
    if (holdingNote) {
        const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
        const endTime = holdingNote.time + holdingNote.duration;
        
        if (currentSongTime < endTime - 0.1) {
            holdingNote.isHolding = false;
            holdingNote.visible = false; 
            holdingNote.hit = true;      
            handleJudge('MISS');         
        }
    }
}

// イベントリスナー
window.addEventListener('keydown', e => {
    if (state.currentScene === 'game' && e.repeat) return;
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
        return;
    }
    
    // ★追加: 待機中ならどのキーでもスタート
    if (state.currentScene === 'game' && state.isWaitingStart) {
        startRealGame();
        return;
    }

    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) handleInputDown(keyIndex);
});

window.addEventListener('keyup', e => {
    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) handleInputUp(keyIndex);
});

// タッチイベント設定
const touchMap = {};
function setupTouchEvents() {
    const canvas = document.getElementById('gameCanvas');
    
    // タッチ位置検出を「画面4等分」に変更
    const getLaneFromTouch = (touch) => {
        const rect = canvas.getBoundingClientRect();
        const relativeX = (touch.clientX - rect.left) / rect.width;
        
        // 単純に画面幅を4等分して判定する（端っこの無反応をなくす）
        if (relativeX >= 0 && relativeX <= 1) {
            // 0~3のインデックスに変換して返す
            return Math.floor(relativeX * CONFIG.LANE_COUNT);
        }
        return -1;
    };

    canvas.addEventListener('touchstart', e => {
        e.preventDefault(); 
        
        // ★追加: 待機中ならタップでスタート
        if (state.currentScene === 'game' && state.isWaitingStart) {
            startRealGame();
            return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = getLaneFromTouch(touch);
            if (lane !== -1 && lane < CONFIG.LANE_COUNT) {
                touchMap[touch.identifier] = lane;
                handleInputDown(lane);
            }
        }
    }, { passive: false });

    const handleEnd = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = touchMap[touch.identifier];
            if (lane !== undefined) {
                handleInputUp(lane);
                delete touchMap[touch.identifier];
            }
        }
    };
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleEnd, { passive: false });
}
setupTouchEvents();

window.addEventListener('touchstart', (e) => {
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
    }
});


// ゲームループ
function gameLoop() {
    if (!state.isPlaying) return;

    // ★修正: 待機中は「時間を止める（-1.5秒地点で固定）」
    // 描画関数(renderGame)は (現在時刻 - startTime) で時間を計算するため、
    // startTime を毎フレーム更新して「常に差分が -1.5 になる」ように騙します。
    if (state.isWaitingStart) {
        // 目標時間(-1.5) = (現在時刻 - startTime) - globalOffset
        // startTime = 現在時刻 - globalOffset - 目標時間
        state.startTime = state.audioCtx.currentTime - state.globalOffset + 1.5;
    }

    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;

    // --- オートプレイ処理 ---
    if (state.isAuto && !state.isWaitingStart) { 
        state.notes.forEach(note => {
            if (note.hit || !note.visible) return;
            if (note.isHolding) return; 

            const effectiveDiff = getEffectiveDiff(currentSongTime, note.time);
            
            if (effectiveDiff <= 0) {
                 state.laneLights[note.lane] = 0.3;
                 
                 if (note.duration > 0) {
                     note.isHolding = true;
                     handleJudge('PERFECT', ''); 
                     playSound('hit');
                     createHitEffect(note.lane);
                 } else {
                     note.hit = true;
                     note.visible = false;
                     handleJudge('PERFECT', '');
                     playSound('hit');
                     createHitEffect(note.lane);
                 }
            }
        });
    }

    // --- 通常処理 ---

    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) state.laneLights[i] = Math.max(0, state.laneLights[i] - 0.05);
    }
    state.hitEffects = state.hitEffects.filter(effect => {
        return (currentSongTime - effect.startTime) < effect.duration;
    });
    
    state.notes.forEach(note => {
        if (!note.visible) return;
        
        const effectiveDiff = getEffectiveDiff(currentSongTime, note.time);
        
        if (!state.isWaitingStart) {
            if (!state.isAuto && !note.isHolding && effectiveDiff < -CONFIG.JUDGE_WINDOW.BAD && !note.hit) {
                note.visible = false;
                handleJudge('MISS');
            }
            
            if (note.isHolding) {
                const endTime = note.time + (note.duration || 0);
                if (currentSongTime >= endTime) {
                    note.isHolding = false;
                    note.hit = true;      
                    note.visible = false; 
                    handleJudge('PERFECT'); 
                    playSound('hit');       
                    createHitEffect(note.lane);
                }
                state.laneLights[note.lane] = 0.2; 
            }
        }
    });

    renderGame(state);
    
    // 待機中のオーバーレイ表示
    if (state.isWaitingStart) {
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 30px Arial";
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#0ff";
        ctx.shadowBlur = 10;
        ctx.fillText("TOUCH TO START", canvas.width / 2, canvas.height / 2);
        
        ctx.font = "16px Arial";
        ctx.fillStyle = "#ccc";
        ctx.shadowBlur = 0;
        ctx.fillText("TAP SCREEN OR PRESS KEY", canvas.width / 2, canvas.height / 2 + 40);
        ctx.restore();
    }

    if (state.notes.length > 0 && !state.isWaitingStart) {
        const lastNote = state.notes[state.notes.length - 1];
        const lastNoteEndTime = lastNote.time + (lastNote.duration || 0);
        
        if (currentSongTime > lastNoteEndTime + 2.0) {
            finishGame();
            return;
        }
    }
    requestAnimationFrame(gameLoop);
}

function handleJudge(judge,timing) {
    const currentTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;

    if (judge === 'MISS') {
        state.judgeCounts.miss++;
        state.combo = 0;
        state.lastJudge.color = '#888';
        state.lastJudge.timing = '';
    } else {
        state.combo++;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        
        if (judge === 'PERFECT') {
            state.judgeCounts.perfect++;
            state.score += 1000;
            state.lastJudge.color = '#ffd700';
        } else if (judge === 'GREAT') {
            state.judgeCounts.great++;
            state.score += 500;
            state.lastJudge.color = '#0f0';
        } else if (judge === 'GOOD') {
            state.judgeCounts.good++;
            state.score += 100;
            state.lastJudge.color = '#00fffa';
        }
        state.lastJudge.timing = timing;
    }
    state.lastJudge.text = judge;
    state.lastJudge.time = currentTime;
    if (uiScore) {
        const mult = state.speedMultiplier || 1.0;
        const actual = Math.round(CONFIG.NOTE_SPEED * mult);
        uiScore.innerHTML = `SCORE: ${state.score}<br><span style="font-size:0.7em; color:#aaa">SPD: ${actual} (x${mult.toFixed(1)})</span>`;
    }
}

function createHitEffect(laneIdx) {
    const currentTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
    state.hitEffects.push({ lane: laneIdx, startTime: currentTime, duration: 0.3 });
}

toTitle();