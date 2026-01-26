import os
import json
import re
import sys

# 設定
SONGS_DIR = "assets/songs"
OUTPUT_LIST = "assets/song_list.json"

# 難易度の並び順定義
DIFFICULTY_ORDER = {
    "Beginner": 0,
    "Normal": 1,
    "Hyper": 2,
    "Another": 3,
    "Insane": 4,
    "Leggendaria": 5,
    "Easy": 1,
    "Medium": 2,
    "Hard": 3,
    "Challenge": 4,
    "Edit": 5
}

# 8ボタンモード用レーン定義
BMS_LANE_MAP = {
    '16': 0, 
    '11': 1, '12': 2, '13': 3, '14': 4, '15': 5, '18': 6, '19': 7
}

# --- 共通ヘルパー: 難易度名の推定 ---
def guess_bms_difficulty(filename, title):
    filename = filename.upper()
    title = title.upper()
    name_body = os.path.splitext(filename)[0]
    
    # ファイル名やタイトルに含まれるキーワードで判定
    if "BEGINNER" in filename or "BEGINNER" in title: return "Beginner"
    if "LEGGENDARIA" in filename or "LEGGENDARIA" in title: return "Leggendaria"
    if "INSANE" in filename or "INSANE" in title: return "Insane"
    if "ANOTHER" in filename or "ANOTHER" in title: return "Another"
    if "HYPER" in filename or "HYPER" in title: return "Hyper"
    if "NORMAL" in filename or "NORMAL" in title: return "Normal"
    if "LIGHT" in filename or "LIGHT" in title: return "Normal"
    
    # 末尾の識別子 (_N, _H, _A 等)
    if name_body.endswith("_B"): return "Beginner"
    if name_body.endswith("_L"): return "Leggendaria"
    if name_body.endswith("_A"): return "Another"
    if name_body.endswith("_H"): return "Hyper"
    if name_body.endswith("_N"): return "Normal"
    
    return "Unknown" # デフォルト

# --- SMファイル処理 ---
def convert_sm_to_json(sm_path):
    try:
        with open(sm_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"  [Error] Read failed: {e}")
        return None, None

    # メタデータ取得
    title_match = re.search(r"#TITLE:(.*?);", content)
    title = title_match.group(1).strip() if title_match else "Unknown Title"
    
    artist_match = re.search(r"#ARTIST:(.*?);", content)
    artist = artist_match.group(1).strip() if artist_match else "Unknown Artist"

    offset_match = re.search(r"#OFFSET:(-?\d+(\.\d+)?);", content)
    sm_offset = float(offset_match.group(1)) if offset_match else 0.0

    music_match = re.search(r"#MUSIC:(.*?);", content)
    music_file = music_match.group(1).strip() if music_match else ""

    # BPM解析
    bpm_match = re.search(r'#BPMS:(.*?);', content, re.DOTALL)
    bpms = []
    if bpm_match:
        for item in bpm_match.group(1).replace('\n', '').split(','):
            if '=' in item:
                b, v = item.split('=')
                bpms.append((float(b), float(v)))
    
    # STOP解析
    stop_match = re.search(r'#STOPS:(.*?);', content, re.DOTALL)
    stops = []
    if stop_match:
        stop_str = stop_match.group(1).strip()
        if stop_str:
            for item in stop_str.replace('\n', '').split(','):
                if '=' in item:
                    b, v = item.split('=')
                    stops.append((float(b), float(v)))

    # BPMイベント構築
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

    def get_time_at_beat(target_beat):
        epsilon = 0.002
        exact_matches = [t for b, t in beat_time_map if abs(b - target_beat) <= epsilon]
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
    charts = { 
        "bpm": bpms[0][1] if bpms else 120.0, 
        "offset": sm_offset, 
        "bpmEvents": bpm_events,
        "keyCount": 4
    }
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
            lines = measure.strip().split('\n')
            valid_lines = []
            for line in lines:
                line = line.split('//')[0].strip()
                if len(line) >= 4: valid_lines.append(line)
            
            if valid_lines:
                beats_per_line = 4.0 / len(valid_lines)
                for i, line in enumerate(valid_lines):
                    note_beat = round(curr_beat + (i * beats_per_line), 6)
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

    metadata = {
        "title": title,
        "artist": artist,
        "bpm": charts["bpm"],
        "offset": sm_offset,
        "difficulties": difficulty_list,
        "music_file": music_file,
        "keyCount": 4
    }
    return metadata, charts

# --- BMSファイル処理 (単体パース) ---
def parse_single_bms(bms_path):
    try:
        with open(bms_path, 'r', encoding='shift_jis', errors='ignore') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"  [Error] Read failed: {e}")
        return None, None

    header = { "title": "Unknown", "artist": "Unknown", "bpm": 130 }
    main_data = {}
    bpm_defs = {}
    
    for line in lines:
        line = line.strip()
        if not line.startswith('#'): continue
        
        if line.startswith('#TITLE'): header['title'] = line[6:].strip()
        elif line.startswith('#ARTIST'): header['artist'] = line[7:].strip()
        elif line.startswith('#BPM '): header['bpm'] = float(line[4:].strip())
        elif line.startswith('#BPM') and len(line.split()[0]) == 6:
            bpm_defs[line[4:6]] = float(line[6:].strip())
        elif ':' in line:
            cmd, val = line.split(':', 1)
            if len(cmd) == 6 and cmd[1:4].isdigit():
                measure = int(cmd[1:4])
                if measure not in main_data: main_data[measure] = []
                main_data[measure].append({ 'channel': cmd[4:6], 'data': val.strip() })

    sorted_measures = sorted(main_data.keys())
    if not sorted_measures: return None, None
    max_measure = sorted_measures[-1]
    
    notes = []
    bpm_events = [{'time': 0.0, 'bpm': header['bpm']}]
    current_bpm = header['bpm']
    current_time = 0.0
    
    for m in range(max_measure + 1):
        measure_len = 1.0
        events = []
        if m in main_data:
            for item in main_data[m]:
                if item['channel'] == '02': measure_len = float(item['data'])
                else:
                    total = len(item['data']) // 2
                    for i in range(total):
                        val = item['data'][i*2:i*2+2]
                        if val != '00':
                            events.append({ 'pos': i/total, 'ch': item['channel'], 'val': val })
        
        events.sort(key=lambda x: x['pos'])
        last_pos = 0.0
        measure_beats = 4.0 * measure_len
        
        for evt in events:
            dt = (evt['pos'] - last_pos) * measure_beats * (60.0 / current_bpm)
            current_time += dt
            last_pos = evt['pos']
            
            if evt['ch'] == '03':
                current_bpm = int(evt['val'], 16)
                bpm_events.append({'time': round(current_time, 4), 'bpm': current_bpm})
            elif evt['ch'] == '08' and evt['val'] in bpm_defs:
                current_bpm = bpm_defs[evt['val']]
                bpm_events.append({'time': round(current_time, 4), 'bpm': current_bpm})
            elif evt['ch'] in BMS_LANE_MAP:
                notes.append({
                    'time': round(current_time, 4),
                    'lane': BMS_LANE_MAP[evt['ch']],
                    'duration': 0
                })
        
        current_time += (1.0 - last_pos) * measure_beats * (60.0 / current_bpm)

    return header, { "notes": notes, "bpmEvents": bpm_events }


# --- メイン処理 ---
def scan_all_songs():
    song_list = []
    
    if not os.path.exists(SONGS_DIR):
        print(f"Folder not found: {SONGS_DIR}")
        return

    # os.listdirでフォルダ一覧を取得
    try:
        folders = [f for f in os.listdir(SONGS_DIR) if os.path.isdir(os.path.join(SONGS_DIR, f))]
    except OSError as e:
        print(f"Error reading songs directory: {e}")
        return

    print(f"Found {len(folders)} folders in {SONGS_DIR}...")

    for folder in folders:
        folder_path = os.path.join(SONGS_DIR, folder)
        json_file = os.path.join(folder_path, f"{folder}.json")
        
        # フォルダ内の全ファイルを取得し、拡張子で分類（大文字小文字無視）
        try:
            all_files = os.listdir(folder_path)
        except OSError:
            print(f"Skipping {folder}: Cannot access directory.")
            continue

        sm_files = [os.path.join(folder_path, f) for f in all_files if f.lower().endswith('.sm')]
        bms_files = [os.path.join(folder_path, f) for f in all_files if f.lower().endswith(('.bms', '.bme', '.bml'))]
        
        # 1. SMファイルがある場合
        if sm_files:
            print(f"Processing SM: {folder} ...", end="")
            meta, charts = convert_sm_to_json(sm_files[0])
            if meta:
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(charts, f, indent=2)
                
                # 音声ファイル確認
                target_music = meta["music_file"]
                # ターゲット音楽ファイルも大文字小文字の違いを吸収して探す
                found_audio = None
                
                # 指定されたファイル名がある場合、実在確認（大文字小文字無視）
                if target_music:
                    for f in all_files:
                        if f.lower() == target_music.lower():
                            found_audio = f
                            break
                
                # なければ自動探索
                if not found_audio:
                     audio_candidates = [f for f in all_files if f.lower().endswith(('.ogg', '.mp3', '.wav'))]
                     if audio_candidates:
                         found_audio = audio_candidates[0]

                if found_audio:
                    meta["music_file"] = found_audio
                    fmt = os.path.splitext(found_audio)[1][1:].lower()
                else:
                    meta["music_file"] = ""
                    fmt = "mp3"

                song_list.append({
                    "id": folder,
                    "folder": folder,
                    "title": meta["title"],
                    "artist": meta["artist"],
                    "bpm": meta["bpm"],
                    "offset": meta["offset"],
                    "difficulties": meta["difficulties"],
                    "audioFile": meta["music_file"],
                    "format": fmt,
                    "keyCount": 4
                })
                print(" OK")
            continue

        # 2. BMSファイル群の処理
        if bms_files:
            print(f"Processing BMS Group: {folder} ({len(bms_files)} files) ...", end="")
            
            merged_charts = { 
                "bpm": 130, "offset": 0, "bpmEvents": [], "keyCount": 8
            }
            difficulties = []
            
            base_header = None
            
            for bms_file in bms_files:
                header, data = parse_single_bms(bms_file)
                if not header: continue
                
                if not base_header: 
                    base_header = header
                    merged_charts["bpm"] = header["bpm"]
                    merged_charts["bpmEvents"] = data["bpmEvents"]
                
                # 難易度名を推測
                fname = os.path.basename(bms_file)
                diff_name = guess_bms_difficulty(fname, header["title"])
                
                # 名前が重複した場合の回避策
                if diff_name in merged_charts:
                    diff_name += "_2" 
                
                merged_charts[diff_name] = data["notes"]
                difficulties.append(diff_name)
            
            # 難易度順ソート
            difficulties.sort(key=lambda d: DIFFICULTY_ORDER.get(d, 99))
            
            if base_header:
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(merged_charts, f, indent=2)

                # 音声ファイル検索
                found_audio = None
                audio_candidates = [f for f in all_files if f.lower().endswith(('.ogg', '.mp3', '.wav'))]
                # BMSはキー音が多いので、ファイルサイズが大きいものをBGMとして優先的に選ぶロジックなどが本来は必要だが、
                # ここではとりあえず最初の候補、あるいは "preview" などを除外するなどの工夫が可能。
                # 今回は単純に見つかった最初の音声ファイルを採用。
                if audio_candidates:
                    found_audio = audio_candidates[0]
                    # もし "preview" が含まれていたら、他のを探してみる（簡易的）
                    for aud in audio_candidates:
                        if "preview" not in aud.lower():
                            found_audio = aud
                            break

                fmt = "mp3"
                if found_audio:
                    fmt = os.path.splitext(found_audio)[1][1:].lower()
                else:
                    found_audio = ""

                song_list.append({
                    "id": folder,
                    "folder": folder,
                    "title": base_header["title"], 
                    "artist": base_header["artist"],
                    "bpm": base_header["bpm"],
                    "offset": 0,
                    "difficulties": difficulties,
                    "audioFile": found_audio,
                    "format": fmt,
                    "keyCount": 8
                })
                print(" OK")
            else:
                print(" Failed (No valid BMS data)")
        else:
            print(f"Skipping {folder}: No .sm or .bms files.")

    with open(OUTPUT_LIST, 'w', encoding='utf-8') as f:
        json.dump(song_list, f, indent=2)
    
    print(f"\nSaved song list to {OUTPUT_LIST}")

if __name__ == '__main__':
    scan_all_songs()