// js/main.js

import { CONFIG, SONGS } from './constants.js'; // ★CHARTではなくSONGSをインポート
import { initAudio, playSound } from './audio.js';
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
    judgeCounts: { perfect: 0, great: 0, bad: 0, miss: 0 }
};

// 初期化
const canvas = document.getElementById('gameCanvas');
initRenderer(canvas);

// --- シーン管理関数 ---

// 1. タイトル画面へ
function toTitle() {
    switchScene('title');
    // 最初のクリックでAudioContextを作るため、クリックイベントを設定
    scenes.title.onclick = () => {
        state.audioCtx = initAudio(); // 音声エンジンの起動
        toSelect();
    };
}

// 2. 選曲画面へ
function toSelect() {
    state.isPlaying = false; // ゲーム停止
    switchScene('select');
    
    // 曲リストを生成してボタンとして配置
    songListContainer.innerHTML = '';
    SONGS.forEach(song => {
        const btn = document.createElement('div');
        btn.className = 'song-btn';
        btn.innerHTML = `
            <div style="font-size: 1.2rem; font-weight: bold;">${song.title}</div>
            <div class="song-info">LEVEL: ${song.level}</div>
        `;
        // クリックしたらその曲でゲーム開始
        btn.onclick = () => startGame(song);
        songListContainer.appendChild(btn);
    });
}

// 3. ゲーム画面へ (startGame)
function startGame(songData) {
    state.selectedSong = songData; // 選んだ曲を保存
    
    // 状態リセット
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.judgeCounts = { perfect: 0, great: 0, bad: 0, miss: 0 };
    state.hitEffects = [];
    state.lastJudge = { text: '', time: -10, color: '#fff' };
    
    // ★重要: 選んだ曲の譜面(chart)をコピーしてセット
    state.notes = songData.chart.map(n => ({ ...n, hit: false, visible: true }));

    // 時間管理
    state.startTime = state.audioCtx.currentTime + CONFIG.START_DELAY;
    state.isPlaying = true;

    // 画面切り替え
    switchScene('game');
    
    // ループ開始
    requestAnimationFrame(gameLoop);
    scheduleMetronome();
}

// 4. リザルト画面へ (finishGame)
function finishGame() {
    state.isPlaying = false;
    switchScene('result');

    // ランク計算
    let rank = 'C';
    if (state.score >= state.selectedSong.chart.length*1000*0.85) rank = 'S';
    else if (state.score >= state.selectedSong.chart.length*1000*0.7) rank = 'A';
    else if (state.score >= state.selectedSong.chart.length*1000*0.6) rank = 'B';

    scenes.result.innerHTML = `
        <h1 style="color: #ff0055; margin-bottom: 10px;">FINISH!</h1>
        <h2 style="color: #fff">${state.selectedSong.title}</h2>
        
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
            <div style="color: #ff8800">BAD</div><div style="text-align: right">${state.judgeCounts.bad}</div>
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
    // 全部のシーンを非表示にする
    Object.values(scenes).forEach(el => el.style.display = 'none');
    // 指定されたシーンだけ表示する
    scenes[sceneName].style.display = 'flex'; // flexboxレイアウトを使用しているため
}


// --- 既存のゲームループ・入力処理 (一部変更あり) ---

// 入力処理
window.addEventListener('keydown', e => {
    if (!state.isPlaying) return; // ゲーム中以外は反応しない
    
    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex === -1) return;

    state.laneLights[keyIndex] = 1.0;

    const currentSongTime = state.audioCtx.currentTime - state.startTime;
    const targetNote = state.notes
        .filter(n => n.lane === keyIndex && !n.hit && n.visible)
        .sort((a, b) => a.time - b.time)[0];

    if (targetNote) {
        const diff = Math.abs(targetNote.time - currentSongTime);
        if (diff <= CONFIG.JUDGE_WINDOW.BAD) {
            targetNote.hit = true;
            targetNote.visible = false;
            let judge = 'BAD';
            if (diff <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
            else if (diff <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
            handleJudge(judge);
            playSound('hit');
            createHitEffect(keyIndex);
        }
    }
});

function gameLoop() {
    if (!state.isPlaying) return; // 停止中はループを止める

    const currentSongTime = state.audioCtx.currentTime - state.startTime;

    // ... (既存のロジック: 光フェードアウト, エフェクト更新, MISS判定) ...
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) state.laneLights[i] = Math.max(0, state.laneLights[i] - 0.05);
    }
    state.hitEffects = state.hitEffects.filter(effect => {
        return (currentSongTime - effect.startTime) < effect.duration;
    });
    state.notes.forEach(note => {
        if (!note.visible) return;
        if (note.time - currentSongTime < -CONFIG.JUDGE_WINDOW.BAD && !note.hit) {
            note.visible = false;
            handleJudge('MISS');
        }
    });

    renderGame(state);

    // 終了判定
    // 曲データの最後を参照するように変更
    const lastNoteTime = state.selectedSong.chart[state.selectedSong.chart.length - 1].time;
    if (currentSongTime > lastNoteTime + 2.0) {
        finishGame();
        return;
    }

    requestAnimationFrame(gameLoop);
}

// 判定処理などは変更なし
function handleJudge(judge) {
    // ... (既存のまま) ...
    const currentTime = state.audioCtx.currentTime - state.startTime;
    if (judge === 'MISS') {
        state.judgeCounts.miss++;
        state.combo = 0;
        state.lastJudge.color = '#888';
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
    }
    state.lastJudge.text = judge;
    state.lastJudge.time = currentTime;
    if(uiScore) uiScore.innerText = state.score;
}

// エフェクト生成などは変更なし
function createHitEffect(laneIdx) {
    const currentTime = state.audioCtx.currentTime - state.startTime;
    state.hitEffects.push({ lane: laneIdx, startTime: currentTime, duration: 0.3 });
}

function scheduleMetronome() {
    if (!state.isPlaying) return;
    if (Math.random() < 0.1) playSound('bgm_beat'); 
    setTimeout(scheduleMetronome, 200);
}

// ★アプリケーション開始
toTitle();