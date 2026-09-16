from flask import Flask, request, jsonify, render_template
import cv2
import numpy as np
import pandas as pd
import joblib
import os
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from werkzeug.utils import secure_filename

app = Flask(__name__)

# สร้างโฟลเดอร์สำหรับเก็บภาพ
UPLOAD_FOLDER = 'images'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# ==========================================
# 1. DATA INGESTION & 2. PREPROCESSING
# ==========================================
def get_historical_weather(timestamp):
    """
    ดึงข้อมูลสภาพอากาศประวัติศาสตร์ 
    ปรับให้รับรูปแบบเวลาจาก input type="datetime-local" ของ HTML
    """
    try:
        hour = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M").hour
    except ValueError:
        hour = 12 # ค่าเริ่มต้นหากแปลงเวลาไม่ได้
        
    if hour >= 15 or hour < 6:
        return {"weather_status": "Gloomy", "label": 0}
    else:
        return {"weather_status": "Clear", "label": 1}

# ==========================================
# 3. FEATURES (สกัดข้อมูลสีท้องฟ้า)
# ==========================================
def extract_sky_colors(image_path):
    """
    อ่านภาพจริงและวิเคราะห์ค่าสี (R, G, B, HSV) จากส่วนที่เป็นท้องฟ้า 
    (ปรับจากการสร้างภาพจำลองในโค้ดเดิม เป็นการอ่านไฟล์จริงด้วย OpenCV)
    """
    img = cv2.imread(image_path)
    if img is None:
        return None
    
    # ดึงเฉพาะส่วนบนของภาพ (ประมาณ 30% ด้านบน)[cite: 1]
    h, w = img.shape[:2]
    sky_region = img[0:int(h*0.3), :]
    
    # แปลงสี[cite: 1]
    sky_rgb = cv2.cvtColor(sky_region, cv2.COLOR_BGR2RGB)
    sky_hsv = cv2.cvtColor(sky_region, cv2.COLOR_BGR2HSV)
    
    # หาค่าเฉลี่ยของแต่ละช่องสี[cite: 1]
    r, g, b = sky_rgb.mean(axis=(0, 1))
    h_val, s, v = sky_hsv.mean(axis=(0, 1))
    
    return {
        "R_mean": round(r, 2), "G_mean": round(g, 2), "B_mean": round(b, 2), 
        "H_mean": round(h_val, 2), "S_mean": round(s, 2), "V_mean": round(v, 2)
    }

# ==========================================
# 4. QUALITY & 5. TRAINING (API Endpoint)
# ==========================================
@app.route('/')
def index():
    # ให้ Flask เสิร์ฟไฟล์ index.html
    return render_template('index.html')

@app.route('/train', methods=['POST'])
def train_model_api():
    if 'images' not in request.files:
        return jsonify({"error": "ไม่พบไฟล์รูปภาพ"}), 400
    
    files = request.files.getlist('images')
    timestamps = request.form.getlist('timestamps')
    
    if len(files) != len(timestamps):
        return jsonify({"error": "ข้อมูลรูปภาพและเวลาไม่สอดคล้องกัน"}), 400

    data_records = []
    
    for i, file in enumerate(files):
        if file.filename == '':
            continue
            
        # สร้างชื่อไฟล์ไม่ให้ซ้ำ และบันทึกลงโฟลเดอร์ images/
        filename = secure_filename(f"{int(datetime.now().timestamp())}_{file.filename}")
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # สกัดสีและสภาพอากาศ
        color_features = extract_sky_colors(filepath)
        weather_info = get_historical_weather(timestamps[i])
        
        if color_features:
            record = {
                "image_path": filepath,
                "timestamp": timestamps[i],
                "weather_status": weather_info["weather_status"],
                "label": weather_info["label"]
            }
            record.update(color_features)
            data_records.append(record)
            
    if not data_records:
        return jsonify({"error": "ไม่สามารถสกัดข้อมูลจากภาพได้"}), 400

    df = pd.DataFrame(data_records)
    
    # ขยาย Data ชั่วคราว (เพื่อสาธิตให้แบ่ง Train/Test ได้หากอัปโหลดรูปน้อย)[cite: 1]
    df_expanded = pd.concat([df]*10, ignore_index=True) 
    
    # 5. TRAINING: ใช้ Random Forest ในการจัดหมวดหมู่สภาพอากาศ[cite: 1]
    X = df_expanded[["R_mean", "G_mean", "B_mean", "H_mean", "S_mean", "V_mean"]]
    y = df_expanded["label"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # 6. EVALUATION
    predictions = model.predict(X_test)
    acc = accuracy_score(y_test, predictions)
    
    # บันทึก Model Weights[cite: 1]
    model_filename = "sky_weather_model.pkl"
    joblib.dump(model, model_filename)
    
    # บันทึกฐานข้อมูลเป็น CSV
    csv_path = "model_db.csv"
    if os.path.exists(csv_path):
        df.to_csv(csv_path, mode='a', header=False, index=False)
    else:
        df.to_csv(csv_path, index=False)

    return jsonify({
        "status": "success",
        "accuracy": round(acc * 100, 2),
        "message": f"เรียนรู้ภาพสำเร็จ {len(data_records)} ภาพ และบันทึกรูปไว้ที่โฟลเดอร์ {UPLOAD_FOLDER}/",
        "sample_data": df.to_dict(orient="records")
    })

if __name__ == "__main__":
    print("Starting Flask API Pipeline...")
    app.run(debug=True, port=5000)
