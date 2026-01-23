import os
import json
import re
import glob
import sys

# 設定
SONGS_DIR = "assets/songs"
OUTPUT_LIST = "assets/song_list.json"

# SMファイルをパースしてJSONに変換する関数
def convert_sm_to_json(sm_path, json_path):
    try:
        with open(sm_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"  [Error] Read failed: {e}")
        return None

    # --- メタデータ取得 ---
    title_match = re.search(r"#TITLE:(.*?);", content)
    title = title_match.group(1).strip() if title_match else "Unknown Title"
    
    artist_match = re.search(r"#ARTIST:(.*?);", content)
    artist = artist_match.group(1).strip() if artist_match else "Unknown Artist"

    offset_match = re.search(r"#OFFSET:(-?\d+(\.\d+)?);", content)
    sm_offset = float(offset_match.group(1)) if offset_match else 0.0

    # ★追加: 音声ファイル名を取得
    music_match = re.search(r"#MUSIC:(.*?);", content)
    music_file = music_match.group(1).strip() if music_match else ""

    # --- BPMとSTOP解析 ---
    bpm_match = re.search(r'#BPMS:(.*?);', content, re.DOTALL)
    bpms = []
    if bpm_match:
        for item in bpm_match.group(1).replace('\n', '').split(','):
            if '=' in item:
                b, v = item.split('=')
                bpms.append((float(b), float(v)))
    
    stop_match = re.search(r'#STOPS:(.*?);', content, re.DOTALL)
    stops = []
    if stop_match:
        stop_str = stop_match.group(1).strip()
        if stop_str:
            for item in stop_str.replace('\n', '').split(','):
                if '=' in item:
                    b, v = item.split('=')
                    stops.append((float(b), float(v)))

    # --- BPMイベント構築 ---
    all_points = set([b[0] for b in bpms] + [s[0] for s in stops])
    sorted_beats = sorted(list(all_points))
    bpm_events = []
    current_time = 0.0
    current_beat = 0.0
    current_bpm = bpms[0][1] if bpms else 120.0
    bpm_events.append({"time": 0.0, "bpm": current_bpm})
    
    beat_time_map = [(0.0, 0.0)]

    for beat in sorted_beats:
        if beat <= 0: continue
        beat_diff = beat - current_beat
        time_diff = beat_diff * (60.0 / current_bpm)
        current_time += time_diff
        current_beat = beat
        beat_time_map.append((current_beat, current_time))

        new_bpm = next((x[1] for x in bpms if abs(x[0] - beat) < 0.001), None)
        if new_bpm is not None:
            current_bpm = new_bpm
            bpm_events.append({"time": round(current_time, 6), "bpm": current_bpm})

        stop_len = next((x[1] for x in stops if abs(x[0] - beat) < 0.001), None)
        if stop_len is not None:
            bpm_events.append({"time": round(current_time, 6), "bpm": 0})
            current_time += stop_len
            bpm_events.append({"time": round(current_time, 6), "bpm": current_bpm})
            beat_time_map.append((current_beat, current_time))

    # --- ノーツ解析 ---
    def get_time_at_beat(target_beat):
        exact_matches = [t for b, t in beat_time_map if abs(b - target_beat) < 0.001]
        if exact_matches: return min(exact_matches)
        last_beat, last_time = beat_time_map[0]
        for b, t in beat_time_map:
            if b > target_beat: break
            last_beat, last_time = b, t
        active_bpm = 120.0
        for b, v in bpms:
            if b <= last_beat + 0.001: active_bpm = v
            else: break
        diff = target_beat - last_beat
        return last_time + diff * (60.0 / active_bpm)

    raw_notes = re.findall(r"#NOTES:(.*?);", content, re.DOTALL)
    charts = { "bpm": bpms[0][1] if bpms else 120.0, "offset": sm_offset, "bpmEvents": bpm_events }
    difficulty_list = []

    for section in raw_notes:
        parts = section.strip().split(':')
        if len(parts) < 6: continue
        diff_name = parts[2].strip()
        difficulty_list.append(diff_name)
        
        parsed_notes = []
        active_holds = {}
        measures = parts[-1].strip().split(',')
        curr_beat = 0.0

        for measure in measures:
            lines = measure.strip().split()
            lines = [l for l in lines if not l.startswith('//') and len(l) >= 4]
            if not lines: continue
            beats_per_line = 4.0 / len(lines)
            for i, line in enumerate(lines):
                note_beat = curr_beat + (i * beats_per_line)
                note_time = get_time_at_beat(note_beat)
                for lane, char in enumerate(line):
                    if lane >= 4: break
                    if char == '1' or char == 'M': 
                        parsed_notes.append({"time": round(note_time, 4), "lane": lane, "duration": 0})
                    elif char == '2': active_holds[lane] = note_time
                    elif char == '3' and lane in active_holds:
                        st = active_holds.pop(lane)
                        parsed_notes.append({"time": round(st, 4), "lane": lane, "duration": round(note_time - st, 4)})
            curr_beat += 4.0
        parsed_notes.sort(key=lambda x: x['time'])
        charts[diff_name] = parsed_notes

    # JSON保存
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(charts, f, indent=2)
    
    return {
        "title": title,
        "artist": artist,
        "bpm": charts["bpm"],
        "offset": sm_offset,
        "difficulties": difficulty_list,
        "music_file": music_file # 抽出したファイル名を返す
    }

# メイン処理
def scan_all_songs():
    song_list = []
    
    if not os.path.exists(SONGS_DIR):
        print(f"Folder not found: {SONGS_DIR}")
        return

    folders = [f for f in os.listdir(SONGS_DIR) if os.path.isdir(os.path.join(SONGS_DIR, f))]
    print(f"Found {len(folders)} folders in {SONGS_DIR}...")

    for folder in folders:
        folder_path = os.path.join(SONGS_DIR, folder)
        sm_files = glob.glob(os.path.join(folder_path, "*.sm"))
        
        song_info = {
            "id": folder,
            "folder": folder,
            "title": folder, 
            "bpm": 150,
            "offset": 0,
            "difficulties": [],
            "format": "mp3",     # デフォルト
            "audioFile": ""      # ★追加: 実際のファイル名
        }

        # 1. SMファイル処理
        if sm_files:
            sm_file = sm_files[0]
            json_file = os.path.join(folder_path, f"{folder}.json")
            
            print(f"Processing: {folder} ...", end="")
            meta = convert_sm_to_json(sm_file, json_file)
            if meta:
                song_info["title"] = meta["title"]
                song_info["bpm"] = meta["bpm"]
                song_info["offset"] = meta["offset"]
                song_info["difficulties"] = meta["difficulties"]
                
                # ★重要: 音声ファイル決定ロジック
                # SMファイルに書いてあるファイル名を確認
                target_music = meta.get("music_file", "")
                target_path = os.path.join(folder_path, target_music)
                
                if target_music and os.path.exists(target_path):
                     # ファイルが見つかったらそれを採用
                     song_info["audioFile"] = target_music
                     song_info["format"] = os.path.splitext(target_music)[1][1:].lower()
                     print(f" [Audio: {target_music}]", end="")
                else:
                     # 見つからない場合はフォルダ内を検索 (ogg -> mp3 -> wav)
                     audios = glob.glob(os.path.join(folder_path, "*.ogg")) + \
                              glob.glob(os.path.join(folder_path, "*.mp3")) + \
                              glob.glob(os.path.join(folder_path, "*.wav"))
                     if audios:
                         filename = os.path.basename(audios[0])
                         song_info["audioFile"] = filename
                         song_info["format"] = os.path.splitext(filename)[1][1:].lower()
                         print(f" [Found: {filename}]", end="")
                     else:
                         print(" [Audio NOT FOUND]", end="")

                print(" OK")
            else:
                print(" Failed to parse SM")
        else:
            print(f"Skipping {folder}: No .sm file found.")
            continue
        
        song_list.append(song_info)

    # リスト保存
    with open(OUTPUT_LIST, 'w', encoding='utf-8') as f:
        json.dump(song_list, f, indent=2)
    
    print(f"\nSaved song list to {OUTPUT_LIST}")

if __name__ == '__main__':
    scan_all_songs()