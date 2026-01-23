import re
import json
import sys
import os

def parse_sm(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return {}

    # --- 1. OFFSETの取得 ---
    offset_match = re.search(r"#OFFSET:(-?\d+(\.\d+)?);", content)
    sm_offset = float(offset_match.group(1)) if offset_match else 0.0

    # --- 2. BPMとSTOPの解析 ---
    # BPMイベント
    bpm_match = re.search(r'#BPMS:(.*?);', content, re.DOTALL)
    bpms = [] 
    if bpm_match:
        for item in bpm_match.group(1).replace('\n', '').split(','):
            if '=' in item:
                b, v = item.split('=')
                bpms.append((float(b), float(v)))
    
    # STOPイベント
    stop_match = re.search(r'#STOPS:(.*?);', content, re.DOTALL)
    stops = [] 
    if stop_match:
        stop_str = stop_match.group(1).strip()
        if stop_str:
            for item in stop_str.replace('\n', '').split(','):
                if '=' in item:
                    b, v = item.split('=')
                    stops.append((float(b), float(v)))

    # 全イベントを統合
    all_points = set([b[0] for b in bpms] + [s[0] for s in stops])
    sorted_beats = sorted(list(all_points))

    bpm_events = []
    
    current_time = 0.0
    current_beat = 0.0
    current_bpm = bpms[0][1] if bpms else 120.0
    
    bpm_events.append({"time": 0.0, "bpm": current_bpm})

    # ★修正点: 時間計算用のマップ
    beat_time_map = [(0.0, 0.0)] 

    for beat in sorted_beats:
        if beat <= 0: continue 

        # 時間を加算
        beat_diff = beat - current_beat
        time_diff = beat_diff * (60.0 / current_bpm)
        current_time += time_diff
        current_beat = beat
        
        # 停止「前」の時間を記録
        beat_time_map.append((current_beat, current_time))

        # イベント処理
        new_bpm = next((x[1] for x in bpms if abs(x[0] - beat) < 0.001), None)
        if new_bpm is not None:
            current_bpm = new_bpm
            bpm_events.append({"time": round(current_time, 6), "bpm": current_bpm})

        stop_len = next((x[1] for x in stops if abs(x[0] - beat) < 0.001), None)
        if stop_len is not None:
            # 停止開始
            bpm_events.append({"time": round(current_time, 6), "bpm": 0})
            
            # 時間を進める
            current_time += stop_len
            
            # 停止終了（再開）
            bpm_events.append({"time": round(current_time, 6), "bpm": current_bpm})
            
            # ★重要: 停止「後」の時間も記録しておく（通過後のノーツ計算用）
            beat_time_map.append((current_beat, current_time))

    print(f"Processed {len(bpm_events)} timing events.")

    # --- 3. ノーツの解析 ---
    # ★ここが修正のキモ: Beatから時間を計算する関数
    def get_time_at_beat(target_beat):
        # 1. ジャストタイミング（停止位置）なら、停止「前」の時間を返す
        # これがないと、停止後の時間（遅れた時間）が判定基準になってしまい、早押しミスになる
        exact_matches = [t for b, t in beat_time_map if abs(b - target_beat) < 0.001]
        if exact_matches:
            return min(exact_matches) 

        # 2. それ以外（補間）は、停止「後」の時間を基準にする
        last_beat, last_time = beat_time_map[0]
        for b, t in beat_time_map:
            if b > target_beat: break
            last_beat, last_time = b, t # 重複時は最後（停止後）をとる
        
        # その区間のBPMを探す
        active_bpm = 120.0
        for b, v in bpms:
            if b <= last_beat + 0.001: active_bpm = v
            else: break
            
        diff = target_beat - last_beat
        return last_time + diff * (60.0 / active_bpm)

    raw_notes_sections = re.findall(r"#NOTES:(.*?);", content, re.DOTALL)
    if not raw_notes_sections: return {}

    charts_by_difficulty = {
        "bpm": bpms[0][1] if bpms else 120.0,
        "offset": sm_offset,
        "bpmEvents": bpm_events 
    }

    for section in raw_notes_sections:
        parts = section.strip().split(':')
        if len(parts) < 6: continue
        
        difficulty_name = parts[2].strip()
        note_data_str = parts[-1]
        
        parsed_notes = []
        active_holds = {}
        measures = note_data_str.strip().split(',')
        curr_beat_cnt = 0.0

        for measure in measures:
            lines = measure.strip().split()
            lines = [l for l in lines if not l.startswith('//') and len(l) >= 4]
            if not lines: continue
            
            divisions = len(lines)
            beats_per_line = 4.0 / divisions

            for i, line in enumerate(lines):
                note_beat = curr_beat_cnt + (i * beats_per_line)
                note_time = get_time_at_beat(note_beat)

                for lane, char in enumerate(line):
                    if lane >= 4: break
                    if char == '1' or char == 'M': 
                        parsed_notes.append({"time": round(note_time, 4), "lane": lane, "duration": 0})
                    elif char == '2': 
                        active_holds[lane] = note_time
                    elif char == '3': 
                        if lane in active_holds:
                            st = active_holds.pop(lane)
                            # duration は差分で計算（停止時間を含んだ正しい長さになる）
                            parsed_notes.append({
                                "time": round(st, 4),
                                "lane": lane,
                                "duration": round(note_time - st, 4)
                            })
            curr_beat_cnt += 4.0
        
        parsed_notes.sort(key=lambda x: x['time'])
        charts_by_difficulty[difficulty_name] = parsed_notes

    return charts_by_difficulty

if __name__ == '__main__':
    target_file = sys.argv[1] if len(sys.argv) > 1 else "assets/songs/tsuki_to_okami/chart.sm"
    
    if not os.path.exists(target_file):
        print(f"File not found: {target_file}")
        sys.exit(1)

    print(f"Converting: {target_file}")
    charts = parse_sm(target_file)
    output_path = target_file.replace(".sm", ".json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(charts, f, indent=2)
    print(f"Done! Saved to {output_path}")