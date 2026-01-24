// js/constants.js

export const CONFIG = {
    NOTE_SPEED: 1000,
    JUDGE_LINE_Y: 500,
    LANE_WIDTH: 100, // main.jsで上書きされていた値をここで適用
    LANE_COUNT: 4,
    START_DELAY: 2.0,
    JUDGE_WINDOW: {
        PERFECT: 0.050,
        GREAT:   0.100,
        GOOD:     0.200
    },
    KEYS: ['d', 'f', 'j', 'k'],
    SONG_BASE_PATH: 'assets/songs/'
};

// 判定幅定義
export const JUDGE_RANGES = {
    PERFECT: 0.033, // 33ms
    GREAT: 0.092,   // 92ms
    GOOD: 0.142     // 142ms
};