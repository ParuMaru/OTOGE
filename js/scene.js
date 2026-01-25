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

// スコア保存用キー生成ヘルパー
const getScoreKey = (folder, difficulty) => `rhythmGame_score_${folder}_${difficulty}`;

// ★追加: ランク計算ヘルパー関数
function getRank(score) {
    if (score >= 990000) return 'SSS';
    if (score >= 950000) return 'SS';
    if (score >= 900000) return 'S';
    if (score >= 800000) return 'A';
    if (score >= 700000) return 'B';
    return 'C';
}

// ★追加: ランクごとの色定義
function getRankColor(rank) {
    switch(rank) {
        case 'SSS': return '#ffd700'; // 金
        case 'SS':  return '#00ffcc'; // 水色
        case 'S':   return '#ff0055'; // 赤
        case 'A':   return '#00cc00'; // 緑
        case 'B':   return '#ffaa00'; // オレンジ
        default:    return '#888';    // グレー
    }
}

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

    const autoBtn = document.createElement('button');
    autoBtn.className = 'setting-btn';
    const updateAutoBtn = () => {
        autoBtn.innerText = state.isAuto ? 'AUTO' : 'AUTO';
        autoBtn.style.borderColor = state.isAuto ? '#ff0' : '#888';
        autoBtn.style.color = state.isAuto ? '#ff0' : '#888';
    };
    updateAutoBtn();
    autoBtn.onclick = () => { state.isAuto = !state.isAuto; updateAutoBtn(); };
    speedContainer.appendChild(autoBtn);

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
    adjBtn.style.borderColor = '#0f0'; adjBtn.style.color = '#0f0'; 
    offsetContainer.appendChild(adjBtn);

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
            
            // ★修正: スコアとランクの表示
            const savedData = JSON.parse(localStorage.getItem(getScoreKey(song.folder, diffName)));
            
            let labelHtml = `<div>${diffName}</div>`;
            if (savedData && savedData.score > 0) {
                const scoreStr = Math.round(savedData.score).toString().padStart(7, '0');
                
                // データにランクがなければ計算する（後方互換性）
                const rank = savedData.rank || getRank(savedData.score);
                const rankColor = getRankColor(rank);

                labelHtml += `<div style="font-size:0.8rem; margin-top:2px;">${scoreStr}</div>`;
                labelHtml += `<div style="font-size:0.9rem; font-weight:bold; color:${rankColor}; margin-top:2px;">${rank}</div>`;
                
                if (savedData.isAP) {
                    btn.style.borderColor = '#ffd700';
                    btn.style.boxShadow = '0 0 5px rgba(255, 215, 0, 0.3)';
                } else if (savedData.isFC) {
                    btn.style.borderColor = '#00ffcc';
                }
            }
            btn.innerHTML = labelHtml;
            
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
    state.selectedDifficulty = difficulty;
    
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

    // ★修正: ランク計算をヘルパー関数に委譲
    const rank = getRank(state.score);

    const isFullCombo = state.judgeCounts.miss === 0 && state.notes.length > 0;
    const isAllPerfect = isFullCombo && state.judgeCounts.great === 0 && state.judgeCounts.good === 0;

    // ★修正: ランク情報も保存
    if (!state.isAuto && state.selectedSong) {
        const key = getScoreKey(state.selectedSong.folder, state.selectedDifficulty);
        const oldData = JSON.parse(localStorage.getItem(key)) || { score: 0, isFC: false, isAP: false };
        
        const finalScore = Math.round(state.score);
        
        // ハイスコア更新時、またはスコアが同じでも新しい方がランクが良い場合(ありえないが念のため)にデータを更新
        // 基本はスコアが高い方を保存
        if (finalScore >= oldData.score) {
            const newData = {
                score: finalScore,
                rank: rank, // ★ランク保存
                isFC: oldData.isFC || isFullCombo,
                isAP: oldData.isAP || isAllPerfect
            };
            localStorage.setItem(key, JSON.stringify(newData));
        } else {
             // スコアは更新していないが、FC/APランプがついた場合のみ更新
             if ((isFullCombo && !oldData.isFC) || (isAllPerfect && !oldData.isAP)) {
                 const newData = { ...oldData, isFC: oldData.isFC || isFullCombo, isAP: oldData.isAP || isAllPerfect };
                 localStorage.setItem(key, JSON.stringify(newData));
             }
        }
    }

    let specialMessage = '';
    const animStyle = `animation: blink 0.3s infinite alternate;`;

    if (isAllPerfect) {
        specialMessage = `<div class="fc-msg" style="color: #ffd700; text-shadow: 0 0 20px #ffd700; ${animStyle}">ALL PERFECT!!</div>`;
    } else if (isFullCombo) {
        specialMessage = `<div class="fc-msg" style="color: #00ffcc; text-shadow: 0 0 20px #00ffcc;">FULL COMBO!!</div>`;
    }

    if (!document.getElementById('anim-style')) {
        const style = document.createElement('style');
        style.id = 'anim-style';
        style.innerHTML = `@keyframes blink { from { opacity: 1; transform: scale(1); } to { opacity: 0.8; transform: scale(1.05); } }`;
        document.head.appendChild(style);
    }

    const displayScore = Math.round(state.score).toString().padStart(7, '0');

    scenes.result.innerHTML = `
        <h1 style="color: #ff0055; margin: 10px 0 5px 0; font-size: 2rem;">FINISH!</h1>
        <h2 style="color: #fff; font-size: 1.2rem; margin: 0;">${state.selectedSong ? state.selectedSong.title : ''}</h2>
        
        <div class="result-layout">
            <div class="result-left">
                ${specialMessage}
                <div class="rank-text">RANK ${rank}</div>
                <div class="score-box">
                    SCORE: ${displayScore} <br>
                    <span style="font-size: 0.8rem; color: #aaa">MAX COMBO: ${state.maxCombo}</span>
                </div>
            </div>

            <div class="result-right">
                <div class="judge-grid">
                    <div style="color: #ffd700">PERFECT</div><div style="text-align: right">${state.judgeCounts.perfect}</div>
                    <div style="color: #0f0">GREAT</div><div style="text-align: right">${state.judgeCounts.great}</div>
                    <div style="color: #00fffa">GOOD</div><div style="text-align: right">${state.judgeCounts.good}</div>
                    <div style="color: #888">MISS</div><div style="text-align: right">${state.judgeCounts.miss}</div>
                </div>
                
                <div class="result-buttons">
                    <button id="btn-retry" class="song-btn">RETRY</button>
                    <button id="btn-select" class="song-btn">SELECT SONG</button>
                </div>
            </div>
        </div>
        
        <div id="effect-center" style="position:absolute; top:50%; left:50%; width:0; height:0;"></div>
    `;

    document.getElementById('btn-retry').onclick = () => startGame(state.selectedSong, state.selectedDifficulty);
    document.getElementById('btn-select').onclick = () => toSelect();

    if (isAllPerfect) {
        if(window.spawnFullComboEffect) window.spawnFullComboEffect(scenes.result, 'gold', 80);
    } else if (isFullCombo) {
        if(window.spawnFullComboEffect) window.spawnFullComboEffect(scenes.result, 'cyan', 50);
    }
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

// 内部関数
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
    const flash = document.createElement('div');
    flash.className = 'flash-effect';
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 600);

    const centerPoint = container.querySelector('#effect-center') || container;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'fc-particle';

        const colorBase = type === 'gold' ? '#ffd700' : '#00ffcc';
        const colorVar = type === 'gold' ? '#ffffff' : '#0099ff';
        p.style.backgroundColor = Math.random() > 0.3 ? colorBase : colorVar;
        p.style.boxShadow = `0 0 ${5 + Math.random() * 10}px ${colorBase}`;

        const angle = Math.random() * Math.PI * 2;
        const distance = 200 + Math.random() * 300;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;

        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);

        const duration = 1 + Math.random() * 0.5; 
        p.style.animation = `particle-burst ${duration}s ease-out forwards`;

        centerPoint.appendChild(p);

        setTimeout(() => {
            p.remove();
        }, duration * 1000 + 100);
    }
}

export function playStageClearEffect() {
    const container = document.getElementById('scene-game');
    const isFullCombo = state.judgeCounts.miss === 0;
    const text = isFullCombo ? "FULL COMBO!!" : "FINISH!!";
    const color = isFullCombo ? "#00ffcc" : "#ff0055"; 
    
    const el = document.createElement('div');
    el.innerText = text;
    
    Object.assign(el.style, {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(0)', 
        color: color,
        fontSize: '4rem',
        fontWeight: 'bold',
        fontStyle: 'italic',
        textShadow: `0 0 20px ${color}, 0 0 40px white`,
        zIndex: '200',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.5s'
    });

    container.appendChild(el);

    requestAnimationFrame(() => {
        el.style.transform = 'translate(-50%, -50%) scale(1.2)';
        el.style.opacity = '1';
    });

    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 500);
    }, 2000);
}