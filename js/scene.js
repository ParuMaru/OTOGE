// js/scene.js
import { state, resetGameState } from './state.js';
import { CONFIG } from './constants.js';
import { initAudio, loadAudio, stopMusic, playSound } from './audio.js';

// DOM要素
const scenes = {
    title: document.getElementById('scene-title'),
    select: document.getElementById('scene-select'),
    game: document.getElementById('scene-game'),
    result: document.getElementById('scene-result'),
    calibration: document.getElementById('scene-calibration')
};

const uiScore = document.getElementById('score');

// 曲リストデータ
let globalSongList = [];

// シーン切り替え基本関数
export function switchScene(sceneName) {
    state.currentScene = sceneName;
    Object.values(scenes).forEach(el => { if(el) el.style.display = 'none'; });
    if(scenes[sceneName]) scenes[sceneName].style.display = 'flex';
}

// --- TITLE SCENE ---
export function toTitle() {
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

// --- SELECT SCENE ---
export function toSelect() {
    state.isPlaying = false;
    state.calibData.active = false;
    if(state.calibData.timerId) clearTimeout(state.calibData.timerId);
    stopMusic();
    switchScene('select');
    
    const settingPanel = document.getElementById('setting-panel');
    settingPanel.innerHTML = ''; 

    const storageKey = `rhythmGame_speed_${state.gameMode}`;
    const savedSpeed = localStorage.getItem(storageKey);
    if (savedSpeed) state.greenNumber = parseInt(savedSpeed);
    else state.greenNumber = (state.gameMode === 'beginner') ? 800 : 500;

    // UI構築
    const labelContainer = document.createElement('div');
    labelContainer.style.marginBottom = '10px';
    labelContainer.style.display = 'flex';
    labelContainer.style.justifyContent = 'space-around';
    
    const speedLabel = document.createElement('div');
    const offsetLabel = document.createElement('div');
    [speedLabel, offsetLabel].forEach(l => {
        l.style.fontSize = '1.2rem';
        l.style.fontFamily = 'monospace';
        l.style.fontWeight = 'bold';
    });

    const updateLabels = () => {
        speedLabel.innerHTML = `SPEED: <span style="color:#0f0">${state.greenNumber}</span>`;
        const ms = Math.round(state.globalOffset * 1000);
        const sign = ms > 0 ? '+' : '';
        const color = ms === 0 ? '#fff' : (ms > 0 ? '#ff8844' : '#44ccff');
        offsetLabel.innerHTML = `OFFSET: <span style="color:${color}">${sign}${ms}ms</span>`;
    };
    updateLabels();
    
    labelContainer.append(speedLabel, offsetLabel);
    settingPanel.appendChild(labelContainer);

    const createBtn = (text, onClick, className = '') => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.className = `setting-btn ${className}`;
        btn.onclick = onClick;
        return btn;
    };

    const speedContainer = document.createElement('div');
    speedContainer.className = 'setting-buttons';
    
    const changeSpeed = (amount) => {
        state.greenNumber = Math.max(100, Math.min(2000, state.greenNumber + amount));
        localStorage.setItem(storageKey, state.greenNumber);
        updateLabels();
    };
    
    speedContainer.appendChild(createBtn('<< -100', () => changeSpeed(-100), 'btn-fast'));
    speedContainer.appendChild(createBtn('< -10', () => changeSpeed(-10), 'btn-fast'));
    speedContainer.appendChild(createBtn('+10 >', () => changeSpeed(10), 'btn-slow'));
    speedContainer.appendChild(createBtn('+100 >>', () => changeSpeed(100), 'btn-slow'));
    settingPanel.appendChild(speedContainer);

    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'setting-buttons';
    offsetContainer.style.marginTop = '10px';

    const changeOffset = (amount) => {
        state.globalOffset += amount;
        state.globalOffset = Math.round(state.globalOffset * 1000) / 1000;
        localStorage.setItem('rhythmGame_offset', state.globalOffset);
        updateLabels();
    };

    offsetContainer.appendChild(createBtn('<< -10', () => changeOffset(-0.01), 'btn-fast'));
    offsetContainer.appendChild(createBtn('< -1', () => changeOffset(-0.001)));
    offsetContainer.appendChild(createBtn('+1 >', () => changeOffset(0.001)));
    offsetContainer.appendChild(createBtn('+10 >>', () => changeOffset(0.01), 'btn-slow'));
    
    const adjBtn = createBtn('ADJUST', () => toCalibration());
    adjBtn.style.borderColor = '#0f0'; adjBtn.style.color = '#0f0'; adjBtn.style.marginLeft = '10px';
    offsetContainer.appendChild(adjBtn);

    const autoBtn = document.createElement('button');
    autoBtn.className = 'setting-btn';
    autoBtn.style.marginLeft = '5px';
    const updateAutoBtn = () => {
        autoBtn.innerText = state.isAuto ? 'AUTO: ON' : 'AUTO: OFF';
        autoBtn.style.borderColor = state.isAuto ? '#ff0' : '#888';
        autoBtn.style.color = state.isAuto ? '#ff0' : '#888';
    };
    updateAutoBtn();
    autoBtn.onclick = () => { state.isAuto = !state.isAuto; updateAutoBtn(); };
    offsetContainer.appendChild(autoBtn);

    settingPanel.appendChild(offsetContainer);

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

// --- GAME START ---
export async function startGame(songData, difficulty = 'Hard') {
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
        if (!targetNotes) targetNotes = Object.values(chartData)[0];

        state.songOffset = (chartData.offset !== undefined) ? chartData.offset : (songData.offset || 0);
        state.currentBpm = chartData.bpm || songData.bpm;
        
        let maxBpm = songData.bpm || 150; 
        if (chartData.bpmEvents) {
            chartData.bpmEvents.forEach(evt => { if (evt.bpm > maxBpm) maxBpm = evt.bpm; });
        }

        const baseScale = 4.0;
        state.speedMultiplier = (CONFIG.JUDGE_LINE_Y * 1000) / (state.greenNumber * (maxBpm || 150) * baseScale);

        resetGameState();

        state.notes = targetNotes.map(n => ({ ...n, hit: false, visible: true }));
        state.musicBuffer = musicBuffer;
        state.musicDuration = musicBuffer.duration;

        overlay.innerHTML = originalText;
        switchScene('game');

        if (uiScore) {
            const mult = state.speedMultiplier || 1.0;
            const actual = Math.round(CONFIG.NOTE_SPEED * mult);
            uiScore.innerHTML = `SCORE: 0000000<br><span style="font-size:0.7em; color:#aaa">SPD: ${actual} (x${mult.toFixed(1)})</span>`;
        }
        
    } catch (error) {
        console.error("ロードエラー:", error);
        alert(`ロードエラー:\n${error.message}`);
        overlay.innerHTML = originalText;
    }
}

// --- RESULT SCENE ---
export function finishGame() {
    state.isPlaying = false;
    switchScene('result');

    let rank = 'C';
    if (state.score >= 990000) rank = 'SSS';
    else if (state.score >= 950000) rank = 'SS';
    else if (state.score >= 900000) rank = 'S';
    else if (state.score >= 800000) rank = 'A';
    else if (state.score >= 700000) rank = 'B';

    const isFullCombo = state.judgeCounts.miss === 0 && state.notes.length > 0;
    const isAllPerfect = isFullCombo && state.judgeCounts.great === 0 && state.judgeCounts.good === 0;

    let specialMessage = '';
    const animStyle = `animation: blink 0.3s infinite alternate;`;
    if (isAllPerfect) {
        spawnFullComboEffect(scenes.result, 'gold', 80);
        specialMessage = `<div style="color: #ffd700; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #ffd700; ${animStyle}">ALL PERFECT!!</div>`;
    } else if (isFullCombo) {
        spawnFullComboEffect(scenes.result, 'cyan', 50);
        specialMessage = `<div style="color: #00ffcc; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #00ffcc;">FULL COMBO!!</div>`;
    }

    if (!document.getElementById('anim-style')) {
        const style = document.createElement('style');
        style.id = 'anim-style';
        style.innerHTML = `@keyframes blink { from { opacity: 1; transform: scale(1); } to { opacity: 0.8; transform: scale(1.05); } }`;
        document.head.appendChild(style);
    }

    const displayScore = Math.round(state.score).toString().padStart(7, '0');

    scenes.result.innerHTML = `
        <h1 style="color: #ff0055; margin-bottom: 10px;">FINISH!</h1>
        <h2 style="color: #fff">${state.selectedSong ? state.selectedSong.title : ''}</h2>
        ${specialMessage}
        <div style="font-size: 3rem; color: cyan; font-weight: bold; text-shadow: 0 0 20px cyan;">
            RANK ${rank}
        </div>
        <div style="margin: 20px 0; font-size: 1.5rem;">
            SCORE: ${displayScore} <br>
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

// --- CALIBRATION ---
export function toCalibration() {
    switchScene('calibration');
    const statusDiv = document.getElementById('calib-status');
    const resultDiv = document.getElementById('calib-result');
    if(statusDiv) { statusDiv.innerText = "READY..."; statusDiv.style.color = "white"; }
    if(resultDiv) { resultDiv.innerText = ""; }
    
    state.calibData = {
        active: true, beatCount: 0, diffs: [],    
        nextBeatTime: 0, interval: 0.5, timerId: null
    };

    setTimeout(() => {
        if(state.currentScene !== 'calibration') return;
        state.calibData.startTime = state.audioCtx.currentTime;
        state.calibData.nextBeatTime = state.calibData.startTime + 1.0; 
        runCalibrationLoop();
    }, 1000);
}

export function runCalibrationLoop() {
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
        if (statusDiv) {
            if (data.beatCount < 4) {
                statusDiv.innerText = "LISTEN...";
                statusDiv.style.color = "#888";
            } else {
                statusDiv.innerText = "TAP!"; 
                statusDiv.style.color = isAccent ? "#ff0" : "#0ff";
            }
        }
        
        data.nextBeatTime += data.interval;
        data.beatCount++;
        
        const delay = (data.nextBeatTime - state.audioCtx.currentTime) * 1000;
        data.timerId = setTimeout(runCalibrationLoop, Math.max(0, delay));
    } else {
        finishCalibration();
    }
}

// 内部関数（export不要だが、シーン内ロジックなのでここに配置）
function finishCalibration() {
    state.calibData.active = false;
    const diffs = state.calibData.diffs;
    const statusDiv = document.getElementById('calib-status');
    const resultDiv = document.getElementById('calib-result');
    
    if (diffs.length === 0) {
        if(statusDiv) statusDiv.innerText = "FAILED";
        setTimeout(toSelect, 1500);
        return;
    }
    
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    const median = diffs.length % 2 !== 0 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
    
    state.globalOffset = Math.round(median * 1000) / 1000;
    localStorage.setItem('rhythmGame_offset', state.globalOffset);
    
    if(statusDiv) statusDiv.innerText = "COMPLETE!";
    const ms = Math.round(median * 1000);
    const sign = ms > 0 ? '+' : '';
    if(resultDiv) resultDiv.innerText = `OFFSET SET TO: ${sign}${ms}ms`;
    
    setTimeout(toSelect, 2000);
}

function spawnFullComboEffect(container, type, count) {
    // 画面フラッシュ
    const flash = document.createElement('div');
    flash.className = 'flash-effect';
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 600);

    // パーティクルの中心点（リザルト画面の中央付近）
    // innerHTMLで追加した #effect-center を基準にすると位置合わせが楽です
    const centerPoint = container.querySelector('#effect-center') || container;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'fc-particle';

        // 色とサイズをランダムに
        const colorBase = type === 'gold' ? '#ffd700' : '#00ffcc';
        const colorVar = type === 'gold' ? '#ffffff' : '#0099ff';
        p.style.backgroundColor = Math.random() > 0.3 ? colorBase : colorVar;
        p.style.boxShadow = `0 0 ${5 + Math.random() * 10}px ${colorBase}`;

        // ランダムな角度と距離を計算
        const angle = Math.random() * Math.PI * 2;
        // 画面外まで飛ぶように距離を大きめに設定 (200px〜500px)
        const distance = 200 + Math.random() * 300;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        // CSS変数に移動先をセット
        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);

        // アニメーション適用 (時間も少しランダムに)
        const duration = 1 + Math.random() * 0.5; // 1.0〜1.5秒
        p.style.animation = `particle-burst ${duration}s ease-out forwards`;

        centerPoint.appendChild(p);

        // アニメーション終了後に要素を削除（メモリリーク防止）
        setTimeout(() => {
            p.remove();
        }, duration * 1000 + 100);
    }
}