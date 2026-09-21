import pandas as pd
import cv2
import numpy as np
import torch
import os
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
        return 3 # ฟ้ามืด
    elif cloudcover > 70 and solar < 300:
        return 2 # ฟ้าหม่น
    elif cloudcover >= 30 or (cloudcover > 70 and solar >= 300):
        return 1 # ฟ้ามีเมฆ
    else:
        return 0 # ฟ้าโปร่ง

print("กำลังโหลดโมเดล AI แยกชิ้นส่วนท้องฟ้า (SegFormer)...")
processor = SegformerImageProcessor.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")

# 1. โหลดข้อมูล Metadata ที่ได้จากเว็บ และฐานข้อมูลสภาพอากาศ
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    # ถอย 1 ขั้น แล้วเข้าโฟลเดอร์ data (ปรับแก้ตามโครงสร้างจริงของคุณ)
    metadata_path = os.path.join(BASE_DIR, '..', 'data', 'raw_metadata.csv')
    weather_path = os.path.join(BASE_DIR, '..', 'data', 'weatherdb.csv')
    
    metadata_df = pd.read_csv(metadata_path) 
    weather_df = pd.read_csv(weather_path)
    weather_df['datetime'] = weather_df['datetime'].str.slice(0, 16) #[cite: 4]
except Exception as e:
    print(f"เกิดข้อผิดพลาดในการโหลดไฟล์ CSV: {e}")
    exit()

final_records = []

# 2. เริ่มกระบวนการวิเคราะห์ทีละภาพ
print("เริ่มกระบวนการวิเคราะห์และสกัดสีจากภาพ...")
for index, row in metadata_df.iterrows():
    img_path = row['image_path']
    timestamp = row['timestamp']
    
    if not os.path.exists(img_path):
        print(f"⚠️ ไม่พบไฟล์ภาพ: {img_path}")
        continue
        
    try:
        # A. หาสภาพอากาศจาก weatherdb.csv
        w_data = weather_df[weather_df['datetime'] == timestamp]
        if w_data.empty:
            continue
        w_row = w_data.iloc[0]
        
        # B. ใช้ AI ตัดเฉพาะท้องฟ้า
        image = Image.open(img_path).convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        outputs = model(**inputs)
        logits = outputs.logits
        # ขยายผลลัพธ์ให้ขนาดเท่าภาพเดิม
        upsampled_logits = torch.nn.functional.interpolate(
            logits, size=image.size[::-1], mode="bilinear", align_corners=False
        )
        pred_seg = upsampled_logits.argmax(dim=1)[0].numpy()
        
        # ใน ADE20K Dataset รหัสของ "ท้องฟ้า" (Sky) คือ 2
        sky_mask = (pred_seg == 2).astype(np.uint8)
        
        img_cv = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        if np.sum(sky_mask) > 0: # ถ้าเจอท้องฟ้าในภาพ
            # คำนวณค่าเฉลี่ยสีเฉพาะบริเวณที่เป็นท้องฟ้า
            mean_bgr = cv2.mean(img_cv, mask=sky_mask)
            b_mean, g_mean, r_mean = mean_bgr[0], mean_bgr[1], mean_bgr[2]
            h_mean, s_mean, v_mean = rgb_to_hsv_mean(r_mean, g_mean, b_mean)
        else:
            print(f"⚠️ ไม่พบท้องฟ้าในภาพ {img_path} (อาจถูกบังทึบ)")
            continue

        # C. จัดกลุ่มและบันทึก
        label = classify_weather(w_row)
        
        final_records.append({
            'timestamp': timestamp,
            'image_path': img_path,
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
        print(f"✅ ประมวลผลสำเร็จ: {img_path} -> Label: {label}")
        
    except Exception as e:
        print(f"❌ Error in processing {img_path}: {e}")

# 3. บันทึกผลลัพธ์เป็น model_db.csv สำหรับการเทรน Machine Learning ในขั้นต่อไป
output_path = os.path.join(BASE_DIR, '..', 'data', 'model_db.csv')
final_df = pd.DataFrame(final_records) #[cite: 4]
final_df.to_csv(output_path, index=False, encoding='utf-8-sig') #[cite: 4]
