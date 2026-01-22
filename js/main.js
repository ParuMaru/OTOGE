// js/main.js

import { CONFIG, SONGS } from './constants.js'; 
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
    judgeCounts: { perfect: 0, great: 0, bad: 0, miss: 0 },
    speedMultiplier: 1.0,
    
    recordedNotes: [],  // 記録したノーツを貯めておく場所
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
    state.isPlaying = false;
    stopMusic();
    switchScene('select');
    
    const container = document.getElementById('song-list');
    container.innerHTML = ''; 

    // --- ハイスピ設定UI ---
    const settingDiv = document.createElement('div');
    settingDiv.style.marginBottom = '20px';
    settingDiv.style.padding = '10px';
    settingDiv.style.border = '1px solid #555';
    settingDiv.style.background = '#333';
    settingDiv.style.textAlign = 'center';
    
    // ラベル更新用関数
    const updateLabel = () => {
        const mult = state.speedMultiplier || 1.0;
        const actualSpeed = Math.round(CONFIG.NOTE_SPEED * mult);
        speedLabel.innerText = `HI-SPEED: x${mult.toFixed(1)} (SPD:${actualSpeed})`;
    };

    // 現在のスピード表示
    const speedLabel = document.createElement('span');
    speedLabel.style.fontSize = '1.5rem';
    speedLabel.style.margin = '0 20px';
    speedLabel.style.fontFamily = 'monospace';
    updateLabel(); 

    // 減らすボタン
    const minusBtn = document.createElement('button');
    minusBtn.innerText = '◀ Slower';
    minusBtn.className = 'song-btn'; 
    minusBtn.style.width = 'auto';
    minusBtn.style.padding = '5px 15px';
    minusBtn.onclick = () => {
        state.speedMultiplier = Math.max(0.5, (state.speedMultiplier || 1.0) - 0.1);
        updateLabel();
    };

    // 増やすボタン
    const plusBtn = document.createElement('button');
    plusBtn.innerText = 'Faster ▶';
    plusBtn.className = 'song-btn';
    plusBtn.style.width = 'auto';
    plusBtn.style.padding = '5px 15px';
    plusBtn.onclick = () => {
        state.speedMultiplier = Math.min(10.0, (state.speedMultiplier || 1.0) + 0.1);
        updateLabel();
    };

    settingDiv.appendChild(minusBtn);
    settingDiv.appendChild(speedLabel);
    settingDiv.appendChild(plusBtn);
    container.appendChild(settingDiv);


    // --- 曲リスト表示  ---
    SONGS.forEach(song => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.marginBottom = '10px';

        // プレイ開始ボタン
        const btn = document.createElement('div');
        btn.className = 'song-btn';
        btn.style.width = '100%'; // 幅いっぱいに広げる
        btn.innerHTML = `<div style="font-weight:bold;">${song.title}</div><div class="song-info">LV: ${song.level}</div>`;
        btn.onclick = () => startGame(song, false);
        
        row.appendChild(btn);
        container.appendChild(row);
    });
}

// 3. ゲーム画面へ (startGame)
async function startGame(songData, isRecMode = false) {
    state.selectedSong = songData; // 選んだ曲を保存
    state.isRecording = isRecMode;
    
    const overlay = document.getElementById('scene-select');
    const originalText = overlay.innerHTML;
    overlay.innerHTML = '<h1 style="color:white">LOADING DATA...</h1>';

    try {
        // パスの構築
        const base = `${CONFIG.SONG_BASE_PATH}${songData.folder}/`;
        const musicUrl = base + 'music.mp3';
        const chartUrl = base + 'chart.json';

        // ★重要: 音楽と譜面を「並列」で読み込む (待ち時間が短縮される)
        const [musicBuffer, chartData] = await Promise.all([
            loadAudio(musicUrl),            // 音楽のロード
            fetch(chartUrl).then(res => res.json()) // JSONのロードとパース
        ]);

        // --- 読み込み完了後の処理 ---
    
    // 状態リセット
        state.score = 0;
        state.combo = 0;
        state.maxCombo = 0;
        state.judgeCounts = { perfect: 0, great: 0, bad: 0, miss: 0 };
        state.hitEffects = [];
        state.lastJudge = { text: '', time: -10, color: '#fff', timing: '' };
        
        state.notes = chartData.notes.map(n => ({ ...n, hit: false, visible: true }));

        // 音楽再生 & 同期
        state.isPlaying = true;
        playMusic(musicBuffer);
        state.startTime = state.audioCtx.currentTime - (songData.offset || 0);

        // 画面切り替え
        overlay.innerHTML = originalText;
        switchScene('game');
        
        if (uiScore) {
            const mult = state.speedMultiplier || 1.0;
            const actual = Math.round(CONFIG.NOTE_SPEED * mult);
            // 2行で表示（1行目:SCORE, 2行目:スピード）
            uiScore.innerHTML = `SCORE: 0<br><span style="font-size:0.7em; color:#aaa">SPD: ${actual} (x${mult.toFixed(1)})</span>`;
        }
        
        //曲の長さ
        state.musicDuration = musicBuffer.duration;
        
        requestAnimationFrame(gameLoop);

    } catch (error) {
        console.error("ロードエラー:", error);
        alert("データの読み込みに失敗しました。\nassetsフォルダの構成を確認してください。");
        overlay.innerHTML = originalText;
    }
}

// 4. リザルト画面へ (finishGame)
function finishGame() {
    state.isPlaying = false;
    // レコーディング結果の出力
    if (state.isRecording) {
        // 時間順にソート（念のため）
        state.recordedNotes.sort((a, b) => a.time - b.time);

        // JSON形式にする
        const jsonOutput = JSON.stringify({ notes: state.recordedNotes }, null, 2);
        
        console.log("▼▼▼▼▼ 下のデータを chart.json にコピペしてください ▼▼▼▼▼");
        console.log(jsonOutput);
        console.log("▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲");
        
        alert("コンソール(F12)にJSONデータを出力しました！\nこれを chart.json に上書きしてください。");
        
        // リザルト画面に行かずに選曲へ戻る
        toSelect(); 
        return;
    }
    
    switchScene('result');

    // ランク計算
    
    const totalNotes = state.notes.length; 
    const maxScore = totalNotes * 1000; //理論値
    
    let rank = 'C';
    if (state.score >= maxScore*0.85) rank = 'S';
    else if (state.score >= maxScore*0.7) rank = 'A';
    else if (state.score >= maxScore*0.6) rank = 'B';

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
    
    // ★ レコーディングモードの処理（クオンタイズ版）
    if (state.isRecording) {
        // 1. 曲のBPMを取得 (未設定ならデフォルト120)
        const bpm = state.selectedSong.bpm || 120;
        
        // 2. 「1拍(4分音符)の長さ」と「16分音符の長さ」を計算
        // 例: BPM 60なら、1拍は1秒。16分音符はその1/4で0.25秒。
        const beatDuration = 60 / bpm; 
        const note16Duration = beatDuration / 4; 

        // 3. 現在時刻 (オフセット考慮)
        // ※システム遅延補正(CORRECTION)は、クオンタイズする場合は基本的に不要か、
        //  あるいは「早めに叩きがち」な癖がある場合のみ微調整で入れます。
        //  今回は「完全にグリッドに合わせる」ので、生の時刻を使います。
        const rawTime = currentSongTime;

        // 4. クオンタイズ計算（最も近い16分音符の場所に丸める）
        // Math.round( 現在時間 / 16分音符の間隔 ) * 16分音符の間隔
        let quantizedTime = Math.round(rawTime / note16Duration) * note16Duration;

        // 小数点第3位に丸める（JSONを綺麗にするため）
        const time = Math.round(quantizedTime * 1000) / 1000;
        
        // マイナスの時間は除外
        if (time >= 0) {
            // 重複防止: 全く同じ時間に同じレーンのノーツがあったら追加しない
            const isDuplicate = state.recordedNotes.some(n => n.time === time && n.lane === keyIndex);
            
            if (!isDuplicate) {
                state.recordedNotes.push({ time: time, lane: keyIndex });
                console.log(`BPM${bpm} 16分補正: Raw=${rawTime.toFixed(3)} -> Fix=${time}`);

                // 画面表示用
                state.notes.push({
                    time: time,
                    lane: keyIndex,
                    hit: false,
                    visible: true
                });
                
                playSound('hit');
                createHitEffect(keyIndex);
            }
        }
        return; 
    }
    
    const targetNote = state.notes
        .filter(n => n.lane === keyIndex && !n.hit && n.visible)
        .sort((a, b) => a.time - b.time)[0];

    if (targetNote) {
        // ノーツの時間(未来) -今の時間
        // プラスなら「まだ来てないのに押した」＝ FAST
        // マイナスなら「通り過ぎてから押した」＝ SLOW
        const rawDiff = targetNote.time - currentSongTime;
        const diff = Math.abs(rawDiff); // 判定用には絶対値を使う
        if (diff <= CONFIG.JUDGE_WINDOW.BAD) {
            targetNote.hit = true;
            targetNote.visible = false;
            let judge = 'BAD';
            if (diff <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
            else if (diff <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';
            const timing = rawDiff > 0 ? 'FAST' : 'SLOW';
            handleJudge(judge,timing);
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
    if (state.isRecording) {
        // ★レコーディング時: 曲の長さ + 2秒で終了
        if (currentSongTime > state.musicDuration + 2.0) {
            finishGame();
            return;
        }
    } else {
        // ★通常プレイ時: 最後のノーツ + 2秒で終了 (既存のロジック)
        if (state.notes.length > 0) {
            const lastNoteTime = state.notes[state.notes.length - 1].time;
            if (currentSongTime > lastNoteTime + 2.0) {
                finishGame();
                return;
            }
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