// js/main.js

import { CONFIG, JUDGE_RANGES } from './constants.js'; 
import { initAudio, playSound } from './audio.js';
import { initRenderer, renderGame } from './renderer.js';
import { state } from './state.js';
import { initInput } from './input.js';
import { toTitle, finishGame, playStageClearEffect } from './scene.js';
import { handleJudge, createHitEffect, getEffectiveDiff } from './logic.js';

const canvas = document.getElementById('gameCanvas');

// ★追加: 画面サイズに合わせてCanvasと設定を更新する関数
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // レーンの幅を画面幅の1/4に再設定
    CONFIG.LANE_WIDTH = canvas.width / CONFIG.LANE_COUNT;
    
    // 判定ラインの位置も画面の高さに合わせて調整 (下から100pxの位置など)
    // 定数 JUDGE_LINE_Y は書き換えられない(constだとエラーになる)ので、
    // constants.js の CONFIG.JUDGE_LINE_Y を書き換えるか、
    // ここで直接値を更新するようにコード全体の修正が必要ですが、
    // いったん「判定ラインは高さの80%の位置」とする例を書きます
    
    CONFIG.JUDGE_LINE_Y = canvas.height * 0.8;
}

resizeCanvas();
//  スマホが回転したりウィンドウサイズが変わったら実行
window.addEventListener('resize', resizeCanvas);

// --- 初期化 ---

initRenderer(canvas);
initInput(canvas);

// アプリ開始
toTitle();

// メインループの開始
requestAnimationFrame(gameLoop);

// --- ゲームループ ---
const ctx = canvas.getContext('2d');



function gameLoop() {
    if (!state.isPlaying) {
        requestAnimationFrame(gameLoop);
        return;
    }

    let currentSongTime;
    if (state.isWaitingStart) {
        state.startTime = state.audioCtx.currentTime - state.globalOffset + 1.5;
        currentSongTime = -1.5; 
    } else {
        currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
    }

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

    // --- 判定・状態更新 ---
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
            // 見逃し(MISS)判定
            if (!state.isAuto && !note.isHolding && effectiveDiff < -JUDGE_RANGES.GOOD && !note.hit) {
                note.visible = false;
                handleJudge('MISS');
            }
            
            // ロングノーツ終端判定
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

    // --- 描画 ---
    renderGame(state);
    
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
    
    // --- 演出トリガー ---
    if (state.isInputFinished && !state.hasPlayedFinishEffect) {
        state.hasPlayedFinishEffect = true; // 重複実行防止（state.jsには定義してないので動的に追加でOK、あるいはstate.jsに追加しても良い）
        playStageClearEffect();
    }
    
    // --- 終了判定 ---
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