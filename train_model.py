import json
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

def load_and_prepare_data(json_file_path):
    print(f"กำลังอ่านข้อมูลจากไฟล์: {json_file_path}...")
    
    with open(json_file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
        
    df = pd.DataFrame(data)
    print(f"จำนวนข้อมูลทั้งหมดที่โหลดได้: {len(df)} รายการ")
    
    # 🌟 ปรับปรุง: เปลี่ยนชื่อคอลัมน์ให้ตรงกับที่ดึงมาจาก weatherdb.csv
    required_columns = [
        'R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean', 
        'env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation',
        'label'
    ]
    
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        print(f"⚠️ คำเตือน: ข้อมูลเก่าไม่มีคอลัมน์ต่อไปนี้: {missing_cols}")
        print("ระบบจะเติมค่า 0 ลงไปชั่วคราวเพื่อให้โมเดลทำงานต่อได้")
        for col in missing_cols:
            df[col] = 0
            
    df_clean = df.dropna(subset=required_columns).copy()
    return df_clean

def train_and_evaluate(df):
    print("\nเริ่มกระบวนการ Train โมเดลด้วยข้อมูลสี + ข้อมูลจาก CSV...")
    
    # 🌟 ปรับปรุง: อัปเดต Features ให้ตรงกับข้อมูลชุดใหม่
    features = [
        'R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean',
        'env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation'
    ]
    
    X = df[features]
    y = df['label']
    
    try:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"แบ่งข้อมูลสำหรับ Train: {len(X_train)} รายการ")
    print(f"แบ่งข้อมูลสำหรับ Test: {len(X_test)} รายการ\n")
    
    model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train, y_train)
    
    print("="*40)
    print("🎯 ผลการประเมินความแม่นยำ (Evaluation Results)")
    print("="*40)
    
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"ความแม่นยำรวม (Accuracy): {accuracy * 100:.2f}%\n")
    
    try:
        print("รายละเอียดการแยกคลาส (Classification Report):")
        print(classification_report(y_test, y_pred, target_names=["Gloomy (0)", "Clear (1)"]))
    except Exception:
        print(classification_report(y_test, y_pred))

    print("\n📊 ตัวแปรที่มีผลต่อการตัดสินใจของโมเดลมากที่สุด:")
    importances = model.feature_importances_
    feature_imp_df = pd.DataFrame({'Feature': features, 'Importance': importances})
    feature_imp_df = feature_imp_df.sort_values(by='Importance', ascending=False)
    
    for index, row in feature_imp_df.iterrows():
        print(f" - {row['Feature']}: {row['Importance']:.4f}")
        
    print("\n" + "="*40)
    return model

if __name__ == "__main__":
    json_path = 'model_db.json'
    
    try:
        df_dataset = load_and_prepare_data(json_path)
        
        if len(df_dataset) < 10:
            print("⚠️ ข้อมูลใน model_db.json มีน้อยเกินไป (น้อยกว่า 10 รูป) แนะนำให้เก็บรูปเพิ่มก่อนทำการ Train เพื่อป้องกันโมเดลเพี้ยน")
        else:
            trained_model = train_and_evaluate(df_dataset)
            model_filename = 'sky_weather_rf_model.pkl'
            joblib.dump(trained_model, model_filename)
            
            print(f"✅ บันทึกโมเดลเสร็จสมบูรณ์! ไฟล์ถูกเก็บไว้ที่: {model_filename}")
            
    except FileNotFoundError:
        print(f"❌ ไม่พบไฟล์ '{json_path}' กรุณาตรวจสอบว่ามีไฟล์นี้อยู่ในโฟลเดอร์เดียวกับสคริปต์หรือไม่")
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาด: {e}")
