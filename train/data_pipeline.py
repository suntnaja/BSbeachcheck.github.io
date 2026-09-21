import pandas as pd
import cv2
import numpy as np
import torch
import os
import glob
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
from PIL import Image

def rgb_to_hsv_mean(r, g, b):
    hsv = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0][0]
    return hsv[0], hsv[1], hsv[2]

def classify_weather(row):
    precip = row.get('precip', 0)
    cloudcover = row.get('cloudcover', 0)
    solar = row.get('solarradiation', 0)
    cond = str(row.get('conditions', '')).lower()
    
    if precip > 0 or 'rain' in cond or 'storm' in cond or (cloudcover > 85 and solar < 100):
        return 3
    elif cloudcover > 70 and solar < 300:
        return 2
    elif cloudcover >= 30 or (cloudcover > 70 and solar >= 300):
        return 1
    else:
        return 0

print("กำลังโหลดโมเดล AI แยกชิ้นส่วนท้องฟ้า (SegFormer)...")
processor = SegformerImageProcessor.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")

# ==========================================
# 🌟 ตั้งค่าตำแหน่งโฟลเดอร์
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

IMAGE_DIR = os.path.join(BASE_DIR, '..', 'images') 
WEATHER_PATH = os.path.join(BASE_DIR, '..', 'data', 'weatherdb.csv') # อ้างอิงตามชื่อไฟล์ของคุณ
OUTPUT_PATH = os.path.join(BASE_DIR, '..', 'data', 'model_db.csv')

# 1. โหลดข้อมูลฐานข้อมูลสภาพอากาศ
try:
    weather_df = pd.read_csv(WEATHER_PATH)
    # 🌟 ปรับปรุง: ตัดเวลาเก็บไว้แค่ระดับ "ชั่วโมง" (13 ตัวอักษร) เพื่อใช้จับคู่
    # เช่น "2025-01-01T18:00:00" จะถูกตัดเหลือ "2025-01-01T18"
    weather_df['match_time'] = weather_df['datetime'].str.slice(0, 13)
except Exception as e:
    print(f"❌ เกิดข้อผิดพลาดในการโหลดไฟล์ CSV สภาพอากาศ: {e}")
    exit()

# 2. กวาดไฟล์รูปภาพทั้งหมดในโฟลเดอร์
image_files = glob.glob(os.path.join(IMAGE_DIR, "*.jpg"))
if not image_files:
    print(f"⚠️ ไม่พบไฟล์ภาพ .jpg ในโฟลเดอร์ {IMAGE_DIR} เลย")
    exit()

final_records = []
print(f"เจอภาพทั้งหมด {len(image_files)} ไฟล์ เริ่มวิเคราะห์...")

for img_path in image_files:
    filename = os.path.basename(img_path)
    
    # ถอดรหัสเวลาจากชื่อไฟล์ เช่น "2026-02-02T18_07.jpg" เป็น "2026-02-02T18:07"
    full_timestamp = filename.replace('.jpg', '').replace('_', ':')
    
    # 🌟 ปรับปรุง: ตัดเศษนาทีทิ้ง เอาแค่ 13 ตัวอักษรแรก (ระดับชั่วโมง) ไปค้นหา
    # "2026-02-02T18:07" จะโดนตัดเหลือ "2026-02-02T18"
    target_hour = full_timestamp[:13]
    
    try:
        # A. จับคู่สภาพอากาศ
        w_data = weather_df[weather_df['match_time'] == target_hour]
        if w_data.empty:
            print(f"⚠️ ข้าม: {filename} -> ไม่พบข้อมูลสภาพอากาศของชั่วโมง {target_hour}")
            continue
            
        w_row = w_data.iloc[0]
        
        # B. ตัดขอบฟ้าและสกัดสี
        image = Image.open(img_path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        outputs = model(**inputs)
        logits = outputs.logits
        
        upsampled_logits = torch.nn.functional.interpolate(
            logits, size=image.size[::-1], mode="bilinear", align_corners=False
        )
        pred_seg = upsampled_logits.argmax(dim=1)[0].numpy()
        
        sky_mask = (pred_seg == 2).astype(np.uint8)
        img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        if np.sum(sky_mask) > 0:
            mean_bgr = cv2.mean(img_cv, mask=sky_mask)
            b_mean, g_mean, r_mean = mean_bgr[0], mean_bgr[1], mean_bgr[2]
            h_mean, s_mean, v_mean = rgb_to_hsv_mean(r_mean, g_mean, b_mean)
        else:
            print(f"⚠️ ข้าม: {filename} -> AI มองไม่เห็นท้องฟ้าในภาพ")
            continue

        # C. จัดกลุ่มและบันทึก
        label = classify_weather(w_row)
        
        final_records.append({
            'timestamp': full_timestamp, # บันทึกเวลาเต็มลง CSV เพื่อความแม่นยำ
            'image_path': f"images/{filename}", 
            'R_mean': round(r_mean, 2), 'G_mean': round(g_mean, 2), 'B_mean': round(b_mean, 2),
            'H_mean': round(h_mean, 2), 'S_mean': round(s_mean, 2), 'V_mean': round(v_mean, 2),
            'env_temp': w_row.get('temp', 0),
            'env_humidity': w_row.get('humidity', 0),
            'env_precip': w_row.get('precip', 0),
            'env_cloudcover': w_row.get('cloudcover', 0),
            'env_visibility': w_row.get('visibility', 0),
            'env_solarradiation': w_row.get('solarradiation', 0),
            'label': label
        })
        print(f"✅ สำเร็จ: {filename} (เทียบกับสภาพอากาศเวลา {w_row['datetime']})")
        
    except Exception as e:
        print(f"❌ Error {filename}: {e}")

# 3. บันทึกผลลัพธ์ลง model_db.csv
if final_records:
    final_df = pd.DataFrame(final_records)
    final_df = final_df.sort_values('timestamp').reset_index(drop=True)
    final_df.to_csv(OUTPUT_PATH, index=False, encoding='utf-8-sig')
    print(f"\n🎉 เสร็จสิ้น! ข้อมูลทั้งหมดถูกอัปเดตลง {OUTPUT_PATH}")
else:
    print("\n⚠️ ไม่มีข้อมูลภาพใดผ่านกระบวนการได้สำเร็จเลย")
