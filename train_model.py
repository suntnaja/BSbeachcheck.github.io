import json
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

def load_and_prepare_data(json_file_path):
    print(f"กำลังอ่านข้อมูลจากไฟล์: {json_file_path}...")
    
    # 1. โหลดข้อมูลจากไฟล์ JSON
    with open(json_file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
        
    df = pd.DataFrame(data)
    print(f"จำนวนข้อมูลทั้งหมดที่โหลดได้: {len(df)} รายการ")
    
    # 2. ตรวจสอบและทำความสะอาดข้อมูล (Data Cleaning)
    # คัดเฉพาะคอลัมน์ที่จำเป็นสำหรับการ Train
    required_columns = ['R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean', 'label']
    
    # กรองเอาเฉพาะข้อมูลที่มีคอลัมน์ครบถ้วน
    df_clean = df.dropna(subset=required_columns).copy()
    
    return df_clean

def train_and_evaluate(df):
    print("\nเริ่มกระบวนการ Train โมเดล...")
    
    # 3. กำหนด Features (X) และ Target (y)
    X = df[['R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean']]
    y = df['label']
    
    # 4. แบ่งข้อมูลเป็นชุด Train (80%) และ Test (20%)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print(f"แบ่งข้อมูลสำหรับ Train: {len(X_train)} รายการ")
    print(f"แบ่งข้อมูลสำหรับ Test: {len(X_test)} รายการ\n")
    
    # 5. สร้างและ Train โมเดล Random Forest
    model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    # 6. ประเมินความแม่นยำ (Evaluation)
    print("="*40)
    print("🎯 ผลการประเมินความแม่นยำ (Evaluation Results)")
    print("="*40)
    
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"ความแม่นยำรวม (Accuracy): {accuracy * 100:.2f}%\n")
    
    print("รายละเอียดการแยกคลาส (Classification Report):")
    # ป้องกัน Error กรณีที่ข้อมูลทดสอบมีแค่คลาสเดียว (เช่น มีแต่รูปฟ้าใส)
    try:
        target_names = ["Gloomy (0)", "Clear (1)"]
        print(classification_report(y_test, y_pred, target_names=target_names))
    except Exception:
        print(classification_report(y_test, y_pred))
        
    print("เมทริกซ์ความสับสน (Confusion Matrix):")
    print(confusion_matrix(y_test, y_pred))
    print("="*40)
    
    return model

if __name__ == "__main__":
    json_path = 'model_db.json'
    
    try:
        # เตรียมข้อมูล
        df_dataset = load_and_prepare_data(json_path)
        
        # ตรวจสอบว่ามีข้อมูลเพียงพอหรือไม่ (ควรมีอย่างน้อยสัก 20-30 รูปสำหรับการเทสต์)
        if len(df_dataset) < 10:
            print("⚠️ ข้อมูลใน model_db.json มีน้อยเกินไป (น้อยกว่า 10 รูป) แนะนำให้เก็บรูปเพิ่มก่อนทำการ Train เพื่อป้องกันโมเดลเพี้ยน")
        else:
            # Train โมเดล
            trained_model = train_and_evaluate(df_dataset)
            
            # 7. บันทึกโมเดลเก็บไว้ใช้งาน (Save Model)
            model_filename = 'sky_weather_rf_model.pkl'
            joblib.dump(trained_model, model_filename)
            print(f"\n✅ บันทึกโมเดลเสร็จสมบูรณ์! ไฟล์ถูกเก็บไว้ที่: {model_filename}")
            print("คุณสามารถนำไฟล์นี้ไปสร้าง API เพื่อทำนายสภาพอากาศจากรูปภาพใหม่ได้เลย")
            
    except FileNotFoundError:
        print(f"❌ ไม่พบไฟล์ '{json_path}' กรุณาตรวจสอบว่ามีไฟล์นี้อยู่ในโฟลเดอร์เดียวกับสคริปต์หรือไม่")
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาด: {e}")
