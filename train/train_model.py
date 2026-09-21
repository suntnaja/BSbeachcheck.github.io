import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, mean_absolute_error

def load_and_prepare_data(csv_file_path):
    print(f"กำลังอ่านข้อมูลจากไฟล์: {csv_file_path}...")
    
    # 🌟 ปรับปรุง: ใช้ Pandas อ่านไฟล์ CSV โดยตรง
    df = pd.read_csv(csv_file_path)
    print(f"จำนวนข้อมูลทั้งหมดที่โหลดได้: {len(df)} รายการ")
    
    required_columns = [
        'timestamp', 
        'R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean', 
        'env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation',
        'label'
    ]
    
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        print(f"⚠️ คำเตือน: ข้อมูลเก่าไม่มีคอลัมน์ต่อไปนี้: {missing_cols}")
        for col in missing_cols:
            df[col] = 0
            
    df_clean = df.dropna(subset=required_columns).copy()
    
    # เรียงลำดับข้อมูลตามเวลา (Time Series / Chronological Order)
    if 'timestamp' in df_clean.columns:
        df_clean['timestamp'] = pd.to_datetime(df_clean['timestamp'])
        df_clean = df_clean.sort_values('timestamp').reset_index(drop=True)
        
    return df_clean

def train_and_evaluate(df):
    print("\nเริ่มกระบวนการ Train โมเดล 2 ระบบ (ทำนายสภาพอากาศ + ทำนายค่าสี)...")
    
    # ตัวแปรต้น (Features) ตอนนี้ใช้แค่สภาพอากาศล้วนๆ
    features = [
        'env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation'
    ]
    
    X = df[features]
    
    # ตัวแปรตาม (Targets) แยกเป็น 2 ชุด
    y_label = df['label'] # สำหรับ Classifier
    y_colors = df[['R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean']] # สำหรับ Regressor
    
    # แบ่งข้อมูลแบบ Time Series (อดีต 80% สำหรับ Train, ล่าสุด 20% สำหรับ Test)
    X_train, X_test, y_label_train, y_label_test, y_colors_train, y_colors_test = train_test_split(
        X, y_label, y_colors, test_size=0.2, shuffle=False
    )
    
    print(f"แบ่งข้อมูลสำหรับ Train (อดีต): {len(X_train)} รายการ")
    print(f"แบ่งข้อมูลสำหรับ Test (ล่าสุด): {len(X_test)} รายการ\n")
    
    # ==========================================
    # 1. เทรนโมเดลแยกประเภทสภาพอากาศ (Classification)
    # ==========================================
    clf_model = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    clf_model.fit(X_train, y_label_train)
    
    print("="*50)
    print("🎯 ผลประเมินที่ 1: การทำนายสถานะท้องฟ้า (4 กลุ่ม)")
    print("="*50)
    y_label_pred = clf_model.predict(X_test)
    print(f"ความแม่นยำรวม (Accuracy): {accuracy_score(y_label_test, y_label_pred) * 100:.2f}%\n")
    
    # อัปเดตรายชื่อกลุ่มให้ครบ 4 หมวด
    target_names = ["Clear (0)", "Cloudy (1)", "Gloomy (2)", "Dark (3)"]
    
    try:
        print("รายละเอียดการแยกคลาส (Classification Report):")
        # แจ้งชื่อคลาสโดยจำกัดตามจำนวนคลาสที่พบใน y_label_test จริง
        unique_labels = sorted(y_label_test.unique())
        actual_target_names = [target_names[i] for i in unique_labels]
        print(classification_report(y_label_test, y_label_pred, target_names=actual_target_names))
    except Exception:
        print(classification_report(y_label_test, y_label_pred))
    
    print("ตารางเมทริกซ์ความสับสน (Confusion Matrix):")
    cm = confusion_matrix(y_label_test, y_label_pred)
    
    # ดึงชื่อคลาสที่มีจริงในข้อมูลเพื่อมาทำหัวตาราง
    unique_labels_all = sorted(set(y_label_test) | set(y_label_pred))
    matrix_names = [target_names[i] for i in unique_labels_all]
    
    print(pd.DataFrame(
        cm, 
        index=[f"Actual {name}" for name in matrix_names], 
        columns=[f"Predicted {name}" for name in matrix_names]
    ))

    # ==========================================
    # 2. เทรนโมเดลทำนายตัวเลขค่าสี (Multi-output Regression)
    # ==========================================
    color_model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    color_model.fit(X_train, y_colors_train)

    print("\n" + "="*50)
    print("🎨 ผลประเมินที่ 2: การทำนายค่าสีท้องฟ้า (RGB / HSV)")
    print("="*50)
    y_colors_pred = color_model.predict(X_test)
    
    # คำนวณค่าความคลาดเคลื่อนเฉลี่ย (Mean Absolute Error) ของสีแต่ละตัว
    mae_scores = mean_absolute_error(y_colors_test, y_colors_pred, multioutput='raw_values')
    color_names = ['R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean']
    
    print("ความคลาดเคลื่อนเฉลี่ย (ตัวเลขยิ่งน้อยยิ่งแม่นยำ):")
    for i, color in enumerate(color_names):
        print(f" - {color}: +/- {mae_scores[i]:.2f} หน่วย")

    # ==========================================
    # 3. แพ็ครวมโมเดลทั้ง 2 ตัวเข้าด้วยกันเป็น Dictionary
    # ==========================================
    combined_model = {
        'classifier': clf_model,
        'color_predictor': color_model,
        'feature_names': features
    }
    
    return combined_model

if __name__ == "__main__":
    # 🌟 ปรับปรุง: เปลี่ยนชื่อไฟล์เป้าหมายเป็น .csv
    csv_path = 'data/model_db.csv'
    
    try:
        df_dataset = load_and_prepare_data(csv_path)
        
        if len(df_dataset) < 10:
            print(f"⚠️ ข้อมูลใน {csv_path} มีน้อยเกินไป (น้อยกว่า 10 รูป) แนะนำให้เก็บเพิ่มก่อน")
        else:
            trained_model = train_and_evaluate(df_dataset)
            model_filename = 'sky_weather_rf_model.pkl'
            
            # บันทึกเป็นไฟล์เดียว แต่ข้างในบรรจุโมเดล 2 ชิ้น
            joblib.dump(trained_model, model_filename)
            
            print("\n✅ บันทึกโมเดลเสร็จสมบูรณ์!")
            print(f"ไฟล์ถูกเก็บไว้ที่: {model_filename}")
            
    except FileNotFoundError:
        print(f"❌ ไม่พบไฟล์ '{csv_path}'")
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาด: {e}")
