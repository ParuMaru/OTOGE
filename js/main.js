import { CONFIG, } from './constants.js'; 
import { initAudio, playSound, loadAudio, playMusic, stopMusic } from './audio.js';
import { initRenderer, renderGame } from './renderer.js';

// DOM要素の取得
const scenes = {
    title: document.getElementById('scene-title'),
    select: document.getElementById('scene-select'),
    game: document.getElementById('scene-game'),
    result: document.getElementById('scene-result'),
    calibration: document.getElementById('scene-calibration') // ★追加
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
    judgeCounts: { perfect: 0, great: 0, bad: 0, miss: 0 },
    speedMultiplier: 1.0,
    keyState: [false, false, false, false],
    greenNumber: 500,
    globalOffset: initialOffset,
    
    // ★追加: キャリブレーション用変数
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

// --- シーン管理関数 ---

function toTitle() {
    switchScene('title');
    fetch('assets/song_list.json')
        .then(res => res.json())
        .then(data => { globalSongList = data; })
        .catch(err => { console.error("Song list load failed:", err); });

    scenes.title.onclick = () => {
        state.audioCtx = initAudio(); 
        toSelect();
    };
}

function toSelect() {
    state.isPlaying = false;
    state.calibData.active = false; // 念のためオフ
    if(state.calibData.timerId) clearTimeout(state.calibData.timerId);
    stopMusic();
    switchScene('select');
    
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

    const createBtn = (text, onClick, className) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.className = `setting-btn ${className}`;
        btn.onclick = () => { onClick(); updateLabels(); };
        return btn;
    };

    speedContainer.appendChild(createBtn('<< -100', () => state.greenNumber = Math.max(100, state.greenNumber - 100), 'btn-fast'));
    speedContainer.appendChild(createBtn('< -10', () => state.greenNumber = Math.max(100, state.greenNumber - 10), 'btn-fast'));
    speedContainer.appendChild(createBtn('+10 >', () => state.greenNumber = Math.min(2000, state.greenNumber + 10), 'btn-slow'));
    speedContainer.appendChild(createBtn('+100 >>', () => state.greenNumber = Math.min(2000, state.greenNumber + 100), 'btn-slow'));

    // --- OFFSETボタン ---
    const offsetContainer = document.createElement('div');
    offsetContainer.className = 'setting-buttons';
    offsetContainer.innerHTML = '<div style="width:100%; font-size:0.8rem; color:#aaa; margin-bottom:2px;">JUDGE OFFSET</div>';

    const saveOffset = () => {
        state.globalOffset = Math.round(state.globalOffset * 1000) / 1000;
        localStorage.setItem('rhythmGame_offset', state.globalOffset);
    };

        // ★追加: 自動調整ボタン
    offsetContainer.appendChild(createBtn('-1ms', () => { state.globalOffset -= 0.001; saveOffset(); }, ''));
    offsetContainer.appendChild(createBtn('-10ms', () => { state.globalOffset -= 0.01; saveOffset(); }, ''));
    const autoBtn = document.createElement('button');
    autoBtn.innerText = 'AUTO ADJUST';
    autoBtn.className = 'setting-btn';
    autoBtn.style.borderColor = '#0f0';
    autoBtn.style.color = '#0f0';
    autoBtn.style.marginLeft = '10px';
    autoBtn.style.marginRight = '10px';
    autoBtn.onclick = () => toCalibration();
    offsetContainer.appendChild(autoBtn);
    offsetContainer.appendChild(createBtn('+10ms', () => { state.globalOffset += 0.01; saveOffset(); }, ''));
    offsetContainer.appendChild(createBtn('+1ms', () => { state.globalOffset += 0.001; saveOffset(); }, ''));

    settingPanel.appendChild(speedContainer);
    settingPanel.appendChild(document.createElement('hr')); 
    settingPanel.appendChild(offsetContainer);

    // --- リスト ---
    const listContainer = document.getElementById('song-list');
    listContainer.innerHTML = ''; 
    globalSongList.forEach(song => {
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
        const diffs = song.difficulties || ['Hard'];
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

// ★追加: キャリブレーション画面へ
function toCalibration() {
    switchScene('calibration');
    const statusDiv = document.getElementById('calib-status');
    const resultDiv = document.getElementById('calib-result');
    statusDiv.innerText = "READY...";
    statusDiv.style.color = "white";
    resultDiv.innerText = "";
    
    state.calibData = {
        active: true,
        beatCount: 0, // 今何拍目か
        diffs: [],    // ズレの記録
        nextBeatTime: 0,
        interval: 0.5, // 0.5秒間隔 (BPM120)
        timerId: null
    };

    // 1秒後に開始
    setTimeout(() => {
        if(state.currentScene !== 'calibration') return;
        state.calibData.startTime = state.audioCtx.currentTime;
        state.calibData.nextBeatTime = state.calibData.startTime + 1.0; // 最初の音まで1秒
        runCalibrationLoop();
    }, 1000);
}

// キャリブレーションのループ処理
// js/main.js 内の runCalibrationLoop 関数を修正

function runCalibrationLoop() {
    if (state.currentScene !== 'calibration') return;

    const data = state.calibData;
    const BEAT_TOTAL = 29; // 5回予備 
    
    if (data.beatCount < BEAT_TOTAL) {
        // ★変更: 4拍子のリズムを作る (0, 1, 2, 3)
        // beatCount % 4 が 0 の時だけ「ピーン」、それ以外は「ぽ」
        const isAccent = (data.beatCount % 4 === 0);
        
        if (isAccent) {
            playSound('beat_high'); // ピーン
        } else {
            playSound('beat_low');  // ぽ
        }
        
        const statusDiv = document.getElementById('calib-status');
        
        // 最初の3回は予備（LISTEN...）
        if (data.beatCount < 5) {
            statusDiv.innerText = "LISTEN...";
            statusDiv.style.color = "#888";
        } else {
            // 計測中
            statusDiv.innerText = "TAP!";
            // アクセントの時は文字色を変えて強調
            statusDiv.style.color = isAccent ? "#ff0" : "#0ff";
        }
        
        // 次のビート時間を更新
        data.nextBeatTime += data.interval;
        data.beatCount++;
        
        // 次のループ予約
        const delay = (data.nextBeatTime - state.audioCtx.currentTime) * 1000;
        data.timerId = setTimeout(runCalibrationLoop, Math.max(0, delay));

    } else {
        finishCalibration();
    }
}

// タップ時の処理 (キャリブレーション用)
function handleCalibrationTap() {
    if (!state.calibData.active) return;
    const data = state.calibData;
    
    // 現在時刻
    const tapTime = state.audioCtx.currentTime;
    
    // 一番近いビート（ターゲット）を探す
    // ビート間隔は interval (0.5s). 
    // スタート時間から何拍経過した時点に近いか？
    
    // 予想される直近のビートタイム
    // nextBeatTime は「次に鳴る音」なので、一つ前の音 (-interval) と比較する
    // ただし、すでに音が鳴った直後(nextBeatTimeは未来)かもしれないし、少し前かもしれない
    
    // 今の beatCount は「次に鳴らす予定の番号」。つまり「さっき鳴った」のは beatCount - 1
    const lastBeatIndex = data.beatCount - 1;
    
    // 音が鳴った理想時間 (開始時間 + 1.0s + index * 0.5s)
    const targetTime = (data.startTime + 1.0) + (lastBeatIndex * data.interval);
    
    // ズレ (タップ時間 - ターゲット時間)
    // プラスなら「タップが遅い(音が遅れて聞こえてる)」＝ Audio Latency
    const diff = tapTime - targetTime;
    
    // 外れ値対策: ±0.25秒 (半拍) 以上ずれてたら無視
    if (Math.abs(diff) > 0.25) return;
    
    // 予備動作は無視
    if (lastBeatIndex < 5) return;
    
    // 記録
    data.diffs.push(diff);
    
    // UIフィードバック (フラッシュ)
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
    
    // 中央値 (Median) を計算
    diffs.sort((a, b) => a - b);
    const mid = Math.floor(diffs.length / 2);
    const median = diffs.length % 2 !== 0 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
    
    // 適用
    state.globalOffset = median;
    
    // 保存
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
        const ext = songData.format || 'mp3';
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
        const songOffset = (chartData.offset !== undefined) ? chartData.offset : (songData.offset || 0);
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
        state.judgeCounts = { perfect: 0, great: 0, bad: 0, miss: 0 };
        state.hitEffects = [];
        state.lastJudge = { text: '', time: -10, color: '#fff', timing: '' };
        
        state.notes = targetNotes.map(n => ({ ...n, hit: false, visible: true }));

        state.isPlaying = true;
        playMusic(musicBuffer);
        state.startTime = state.audioCtx.currentTime - songOffset;

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
        alert("データの読み込みに失敗しました。\nassetsフォルダの構成や、chart.jsonを確認してください。");
        overlay.innerHTML = originalText;
    }
}

function finishGame() {
    state.isPlaying = false;
    switchScene('result');

    const totalNotes = state.notes.length; 
    const maxScore = totalNotes * 1000; 
    
    let rank = 'C';
    let rate = 100 * state.score / maxScore ;
    if (state.score >= maxScore*0.9) rank = 'S';
    else if (state.score >= maxScore*0.8) rank = 'A';
    else if (state.score >= maxScore*0.7) rank = 'B';

    const isFullCombo = state.judgeCounts.miss === 0 && totalNotes > 0;
    const isAllPerfect = isFullCombo && state.judgeCounts.great === 0 && state.judgeCounts.bad === 0;

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
        <div style="font-size: 3rem; color: cyan; font-weight: bold; text-shadow: 0 0 20px cyan;">
             ${rate.toPrecision(4)}%
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
            <div style="color: #00ffff">GREAT</div><div style="text-align: right">${state.judgeCounts.great}</div>
            <div style="color: #ff8800">BAD</div><div style="text-align: right">${state.judgeCounts.bad}</div>
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
    
    // 画面の表示切り替え
    Object.values(scenes).forEach(el => { if(el) el.style.display = 'none'; });
    scenes[sceneName].style.display = 'flex';
}

// --- 入力ロジック (分岐あり) ---

// 共通入力ロジック（分岐）
function handleInputDown(laneIndex) {
    // キャリブレーション中は専用処理へ
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
        return;
    }
    
    // ゲーム中以外は無視
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
        const rawDiff = targetNote.time - currentSongTime;
        const diff = Math.abs(rawDiff);

        if (diff <= CONFIG.JUDGE_WINDOW.BAD) {
            if (targetNote.duration > 0) {
                targetNote.isHolding = true; 
                let judge = 'BAD';
                if (diff <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
                else if (diff <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
                handleJudge(judge, rawDiff > 0 ? 'FAST' : 'SLOW');
                playSound('hit');
                createHitEffect(laneIndex);
            } else {
                targetNote.hit = true;
                targetNote.visible = false;
                let judge = 'BAD';
                if (diff <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
                else if (diff <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
                handleJudge(judge, rawDiff > 0 ? 'FAST' : 'SLOW');
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
    // キャリブレーション中はキーリピートも一応通す（連打対策はロジック側でやる）か、ここで止めるか。
    // ゲーム中はリピート無視
    if (state.currentScene === 'game' && e.repeat) return;
    
    // どのキーでもタップとみなすため、キャリブレーション中は適当なレーンID(0)を渡す
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
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
    // キャリブレーション用には body 全体で反応させたいが、
    // ここでは「どこを触ってもOK」にするため window イベントも使う
    
    // ゲーム用Canvasタッチ
    const getLaneFromTouch = (touch) => {
        const rect = canvas.getBoundingClientRect();
        const relativeX = (touch.clientX - rect.left) / rect.width;
        const totalLaneWidth = CONFIG.LANE_WIDTH * CONFIG.LANE_COUNT; 
        const startX = (canvas.width - totalLaneWidth) / 2; 
        const canvasX = relativeX * canvas.width;
        if (canvasX >= startX && canvasX < startX + totalLaneWidth) {
            return Math.floor((canvasX - startX) / CONFIG.LANE_WIDTH);
        }
        return -1;
    };

    canvas.addEventListener('touchstart', e => {
        e.preventDefault(); 
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = getLaneFromTouch(touch);
            if (lane !== -1) {
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

// ★追加: キャリブレーション中は画面全体のタッチを拾う
window.addEventListener('touchstart', (e) => {
    if (state.currentScene === 'calibration') {
        handleCalibrationTap();
    }
});


// ゲームループ
function gameLoop() {
    if (!state.isPlaying) return;

    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;

    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) state.laneLights[i] = Math.max(0, state.laneLights[i] - 0.05);
    }
    state.hitEffects = state.hitEffects.filter(effect => {
        return (currentSongTime - effect.startTime) < effect.duration;
    });
    
    state.notes.forEach(note => {
        if (!note.visible) return;
        if (!note.isHolding && note.time - currentSongTime < -CONFIG.JUDGE_WINDOW.BAD && !note.hit) {
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
    });

    renderGame(state);

    if (state.notes.length > 0) {
        const lastNoteTime = state.notes[state.notes.length - 1].time;
        if (currentSongTime > lastNoteTime + 2.0) {
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
            state.lastJudge.color = '#00ffff';
        } else if (judge === 'BAD') {
            state.judgeCounts.bad++;
            state.score += 100;
            state.lastJudge.color = '#ff8800';
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