// js/main.js

import { CONFIG, } from './constants.js'; 
import { initAudio, playSound, loadAudio, playMusic, stopMusic } from './audio.js';
import { initRenderer, renderGame } from './renderer.js';

// DOM要素の取得
const scenes = {
    title: document.getElementById('scene-title'),
    select: document.getElementById('scene-select'),
    game: document.getElementById('scene-game'),
    result: document.getElementById('scene-result')
};
const songListContainer = document.getElementById('song-list');
const uiScore = document.getElementById('score');
let globalSongList = [];

// ゲームの状態管理
const state = {
    // シーン管理: 'title', 'select', 'game', 'result'
    currentScene: 'title',
    
    // 選択中の曲データ
    selectedSong: null, 

    // ゲームプレイ用データ
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
    greenNumber: 500, // 緑数字の初期値 (500msで落ちてくる)
};

// 初期化
const canvas = document.getElementById('gameCanvas');
initRenderer(canvas);

// --- シーン管理関数 ---

// 1. タイトル画面へ
function toTitle() {
    switchScene('title');
    
    // タイトル画面でリストを読み込んでおく
    fetch('assets/song_list.json')
        .then(res => res.json())
        .then(data => {
            globalSongList = data;
            console.log("Song list loaded:", globalSongList);
        })
        .catch(err => {
            console.error("Song list load failed:", err);
            // エラー時はconstants.jsのバックアップを使う等の処理も可
        });

    scenes.title.onclick = () => {
        state.audioCtx = initAudio(); 
        toSelect();
    };
}

// 2. 選曲画面へ
function toSelect() {
    state.isPlaying = false;
    stopMusic();
    switchScene('select');
    
    // --- 1. 設定パネルの描画 ---
    const settingPanel = document.getElementById('setting-panel');
    settingPanel.innerHTML = ''; // クリア

    // 現在の数値を表示するエリア
    const labelContainer = document.createElement('div');
    labelContainer.style.marginBottom = '10px';
    
    const speedLabel = document.createElement('span');
    speedLabel.style.fontSize = '1.5rem';
    speedLabel.style.fontFamily = 'monospace';
    speedLabel.style.fontWeight = 'bold';
    
    const updateLabel = () => {
        // 緑数字を表示 (小さいほど速い)
        speedLabel.innerHTML = `SPEED: <span style="color:#0f0">${state.greenNumber}</span>`;
    };
    updateLabel();
    labelContainer.appendChild(speedLabel);
    settingPanel.appendChild(labelContainer);

    // ボタンエリア
    const btnContainer = document.createElement('div');
    btnContainer.className = 'setting-buttons';

    // ボタン生成ヘルパー
    const createBtn = (text, changeVal, className) => {
        const btn = document.createElement('button');
        btn.innerHTML = text; // 改行タグなどが使えるようにinnerHTML
        btn.className = `setting-btn ${className}`;
        btn.onclick = () => {
            // 範囲制限 (例: 100 ~ 2000)
            const newVal = state.greenNumber + changeVal;
            state.greenNumber = Math.max(100, Math.min(2000, newVal));
            updateLabel();
        };
        return btn;
    };

    // FAST (数値が減る)
    btnContainer.appendChild(createBtn('<< -100', -100, 'btn-fast'));
    btnContainer.appendChild(createBtn('< -10', -10, 'btn-fast'));
    
    // SLOW (数値が増える)
    btnContainer.appendChild(createBtn('+10 >', 10, 'btn-slow'));
    btnContainer.appendChild(createBtn('+100 >>', 100, 'btn-slow'));

    settingPanel.appendChild(btnContainer);


    // --- 2. 曲リストの描画 ---
    const listContainer = document.getElementById('song-list');
    listContainer.innerHTML = ''; 

    globalSongList.forEach(song => {
        // 曲ごとの枠
        const songRow = document.createElement('div');
        songRow.className = 'song-row';
        
        // 曲タイトル
        const titleDiv = document.createElement('div');
        titleDiv.innerText = song.title;
        titleDiv.style.fontWeight = 'bold';
        titleDiv.style.marginBottom = '10px';
        titleDiv.style.fontSize = '1.2rem';
        songRow.appendChild(titleDiv);

        // 難易度ボタンコンテナ
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

// 3. ゲーム画面へ (startGame)
async function startGame(songData, difficulty = 'Hard') {
    state.selectedSong = songData; // 選んだ曲を保存
    
    const overlay = document.getElementById('scene-select');
    const originalText = overlay.innerHTML;
    overlay.innerHTML = '<h1 style="color:white">LOADING DATA...</h1>';

    try {
        // パスの構築
        const base = `${CONFIG.SONG_BASE_PATH}${songData.folder}/`;
        const ext = songData.format || 'mp3';
        const musicUrl = base + `${songData.folder}.${ext}`;
        const chartUrl = base + `${songData.folder}.json`;

        // 音楽と譜面を並列読み込み
        const [musicBuffer, chartData] = await Promise.all([
            loadAudio(musicUrl),
            fetch(chartUrl).then(res => res.json()) 
        ]);
        
        // --- 1. ソフラン・停止用の事前計算 ---
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
            // データがない場合のフォールバック
            state.bpmEvents = [{ time: 0, bpm: state.currentBpm || 150, y: 0 }];
        }

        // --- 2. 譜面データの取得 ---
        let targetNotes = chartData[difficulty];
        // もし指定した難易度が無かったら、最初のやつを使う
        if (!targetNotes) {
            console.warn(`Difficulty ${difficulty} not found. Using first available.`);
            targetNotes = Object.values(chartData)[0];
        }

        // --- 3. データのセットアップ ---
        const songBpm = chartData.bpm || songData.bpm;
        const songOffset = (chartData.offset !== undefined) ? chartData.offset : (songData.offset || 0);
        state.currentBpm = songBpm;
        
        // ★MAX BPMの探索（ソフラン対応）
        let maxBpm = songData.bpm || 150; // 初期値
        if (chartData.bpmEvents && chartData.bpmEvents.length > 0) {
            chartData.bpmEvents.forEach(evt => {
                if (evt.bpm > maxBpm) maxBpm = evt.bpm;
            });
        }

        // ★緑数字からハイスピ倍率を逆算
        const baseScale = 4.0; // renderer.jsの描画係数
        const judgeY = CONFIG.JUDGE_LINE_Y; 
        const targetBpm = maxBpm > 0 ? maxBpm : 150;
        
        // 倍率決定
        state.speedMultiplier = (judgeY * 1000) / (state.greenNumber * targetBpm * baseScale);

        console.log(`MaxBPM: ${maxBpm}, GreenNum: ${state.greenNumber} => Multiplier: x${state.speedMultiplier.toFixed(2)}`);
        
        // 状態リセット
        state.score = 0;
        state.combo = 0;
        state.maxCombo = 0;
        state.judgeCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
        state.hitEffects = [];
        state.lastJudge = { text: '', time: -10, color: '#fff', timing: '' };
        
        state.notes = targetNotes.map(n => ({ ...n, hit: false, visible: true }));

        // 音楽再生 & 同期
        state.isPlaying = true;
        playMusic(musicBuffer);
        state.startTime = state.audioCtx.currentTime - songOffset;

        // 画面切り替え
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

// 4. リザルト画面へ 
// 4. リザルト画面へ (finishGame)
function finishGame() {
    state.isPlaying = false;
    switchScene('result');

    // ランク計算
    const totalNotes = state.notes.length; 
    const maxScore = totalNotes * 1000; //理論値
    
    let rank = 'C';
    if (state.score >= maxScore*0.85) rank = 'S';
    else if (state.score >= maxScore*0.7) rank = 'A';
    else if (state.score >= maxScore*0.6) rank = 'B';

    // ★追加: フルコンボ・オールパーフェクト判定
    // ノーツが1つ以上あり、かつMISSが0ならフルコンボ
    const isFullCombo = state.judgeCounts.miss === 0 && totalNotes > 0;
    // フルコンボかつ、GREATとBADも0ならオールパーフェクト
    const isAllPerfect = isFullCombo && state.judgeCounts.great === 0 && state.judgeCounts.good === 0;

    let specialMessage = '';
    // アニメーション用のスタイル
    const animStyle = `animation: blink 0.3s infinite alternate;`;

    if (isAllPerfect) {
        specialMessage = `<div style="color: #ffd700; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #ffd700; ${animStyle}">ALL PERFECT!!</div>`;
    } else if (isFullCombo) {
        specialMessage = `<div style="color: #00ffcc; font-size: 2.5rem; font-weight:bold; margin: 10px 0; text-shadow: 0 0 20px #00ffcc;">FULL COMBO!!</div>`;
    }

    // アニメーション定義をheadに追加（存在しなければ）
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
            <div style="color: #00ffff">GREAT</div><div style="text-align: right">${state.judgeCounts.great}</div>
            <div style="color: #ff8800">BAD</div><div style="text-align: right">${state.judgeCounts.good}</div>
            <div style="color: #888">MISS</div><div style="text-align: right">${state.judgeCounts.miss}</div>
        </div>

        <div style="margin-top: 30px; display: flex; gap: 20px;">
            <button id="btn-retry" class="song-btn" style="width: auto; text-align: center;">RETRY</button>
            <button id="btn-select" class="song-btn" style="width: auto; text-align: center;">SELECT SONG</button>
        </div>
    `;

    // ボタンの動作設定
    document.getElementById('btn-retry').onclick = () => startGame(state.selectedSong);
    document.getElementById('btn-select').onclick = () => toSelect();
}

// ユーティリティ: シーンの表示切り替え
function switchScene(sceneName) {
    Object.values(scenes).forEach(el => el.style.display = 'none');
    scenes[sceneName].style.display = 'flex';
}


// --- ゲームループ・入力処理 ---

// レーンが押されたときの処理 (キー/タッチ共通)
function handleLaneDown(laneIndex) {
    if (!state.isPlaying || laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;
    
    // 既に押されている場合は無視（キー長押し対策、タッチ重複対策）
    if (state.keyState[laneIndex]) return;

    state.laneLights[laneIndex] = 0.3;
    state.keyState[laneIndex] = true;

    const currentSongTime = state.audioCtx.currentTime - state.startTime;

    // 判定対象を探す
    const targetNote = state.notes
        .filter(n => n.lane === laneIndex && !n.hit && n.visible)
        .sort((a, b) => a.time - b.time)[0];

    if (targetNote) {
        const rawDiff = targetNote.time - currentSongTime;
        const diff = Math.abs(rawDiff);

        if (diff <= CONFIG.JUDGE_WINDOW.BAD) {
            // ロングノーツ分岐
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

// レーンが離されたときの処理 (キー/タッチ共通)
function handleLaneUp(laneIndex) {
    if (laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;
    
    state.keyState[laneIndex] = false;

    // ホールド中に離してしまったノーツを探す
    const holdingNote = state.notes.find(n => n.lane === laneIndex && n.isHolding && !n.hit);
    if (holdingNote) {
        const currentSongTime = state.audioCtx.currentTime - state.startTime;
        const endTime = holdingNote.time + holdingNote.duration;
        
        // 許容誤差 (0.1秒くらい早めに離してもOKにする)
        if (currentSongTime < endTime - 0.1) {
            holdingNote.isHolding = false;
            holdingNote.visible = false; 
            holdingNote.hit = true;      
            handleJudge('MISS');         
        }
    }
}

// --- キーボードイベント ---

window.addEventListener('keydown', e => {
    if (!state.isPlaying || e.repeat) return; 
    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) handleLaneDown(keyIndex);
});

window.addEventListener('keyup', e => {
    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex !== -1) handleLaneUp(keyIndex);
});


// --- ★追加: タッチイベントの設定（ループの外に定義） ---

// 指のID管理用オブジェクト
const touchMap = {};

function setupTouchEvents() {
    const canvas = document.getElementById('gameCanvas');

    // タッチ座標をレーンインデックスに変換するヘルパー
    const getLaneFromTouch = (touch) => {
        const rect = canvas.getBoundingClientRect();
        
        // Canvas内の相対座標 (0.0 ~ 1.0) を計算
        const relativeX = (touch.clientX - rect.left) / rect.width;
        
        // Canvasの内部幅に対するレーン領域
        const totalLaneWidth = CONFIG.LANE_WIDTH * CONFIG.LANE_COUNT; 
        const startX = (canvas.width - totalLaneWidth) / 2; 
        
        // タッチ位置をCanvas内部解像度(400px幅)に変換
        const canvasX = relativeX * canvas.width;
        
        // レーン判定
        if (canvasX >= startX && canvasX < startX + totalLaneWidth) {
            const laneIndex = Math.floor((canvasX - startX) / CONFIG.LANE_WIDTH);
            return laneIndex;
        }
        return -1; // 範囲外
    };

    // タッチ開始
    canvas.addEventListener('touchstart', e => {
        e.preventDefault(); // スクロール等のデフォルト動作を無効化
        
        // マルチタッチ対応のため changedTouches をループ
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = getLaneFromTouch(touch);
            if (lane !== -1) {
                // 指IDとレーンを紐付けて管理（離した時のため）
                touchMap[touch.identifier] = lane;
                handleLaneDown(lane);
            }
        }
    }, { passive: false });

    // タッチ終了・キャンセル
    const handleEnd = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = touchMap[touch.identifier];
            if (lane !== undefined) {
                handleLaneUp(lane);
                delete touchMap[touch.identifier];
            }
        }
    };
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleEnd, { passive: false });
}

// 初期化フローの中でタッチイベントもセットアップする
setupTouchEvents();


// --- ゲームループ ---

function gameLoop() {
    if (!state.isPlaying) return;

    const currentSongTime = state.audioCtx.currentTime - state.startTime;

    // レーン発光の減衰
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) state.laneLights[i] = Math.max(0, state.laneLights[i] - 0.05);
    }
    // エフェクト終了判定
    state.hitEffects = state.hitEffects.filter(effect => {
        return (currentSongTime - effect.startTime) < effect.duration;
    });
    
    // ノーツ処理
    state.notes.forEach(note => {
        if (!note.visible) return;
        // 通り過ぎた判定
        if (!note.isHolding && note.time - currentSongTime < -CONFIG.JUDGE_WINDOW.BAD && !note.hit) {
            note.visible = false;
            handleJudge('MISS');
        }
        
        // ホールド処理
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

    // 終了判定
    if (state.notes.length > 0) {
        const lastNoteTime = state.notes[state.notes.length - 1].time;
        // 最後のノーツから2秒経過で終了
        if (currentSongTime > lastNoteTime + 2.0) {
            finishGame();
            return;
        }
    }

    requestAnimationFrame(gameLoop);
}


function handleJudge(judge,timing) {
    const currentTime = state.audioCtx.currentTime - state.startTime;
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
            state.judgeCounts.good++;
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
    const currentTime = state.audioCtx.currentTime - state.startTime;
    state.hitEffects.push({ lane: laneIdx, startTime: currentTime, duration: 0.3 });
}

// アプリケーション開始
toTitle();