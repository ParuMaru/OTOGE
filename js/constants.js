// js/constants.js

export const CONFIG = {
    NOTE_SPEED: 1000,
    JUDGE_LINE_Y: 500,
    LANE_WIDTH: 100, // 初期値（4K用）
    LANE_COUNT: 4,   // 初期値（4K用）
    START_DELAY: 2.0,
    JUDGE_WINDOW: {
        PERFECT: 0.050,
        GREAT:   0.100,
        GOOD:     0.200
    },
    KEYS: ['d', 'f', 'j', 'k'], // 初期値（4K用）
    SONG_BASE_PATH: 'assets/songs/'
};

export const JUDGE_RANGES = {
    PERFECT: 0.033,
    GREAT: 0.092,
    GOOD: 0.142
};

// ★追加: モードに応じて設定を書き換える関数
export function configureGameMode(mode) {
    if (mode === '8K') {
        // --- 8ボタン (PC専用 BMSスタイル) ---
        CONFIG.LANE_COUNT = 8;
        // キー配置: [皿(Shift), 1, 2, 3, 4, 5, 6, 7]
        CONFIG.KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']; 
    } else {
        // --- 4ボタン (スマホ・PC共用) ---
        CONFIG.LANE_COUNT = 4;
        CONFIG.KEYS = ['d', 'f', 'j', 'k'];
    }
}