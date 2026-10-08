import pandas as pd
import numpy as np
import os
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error, classification_report, confusion_matrix
from sklearn.multioutput import MultiOutputRegressor

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from xgboost import XGBClassifier, XGBRegressor
from lightgbm import LGBMClassifier, LGBMRegressor
from catboost import CatBoostClassifier, CatBoostRegressor

from skl2onnx import convert_sklearn, update_registered_converter
from skl2onnx.common.data_types import FloatTensorType
from skl2onnx.common.shape_calculator import calculate_linear_classifier_output_shapes, calculate_linear_regressor_output_shapes
from onnxmltools.convert.xgboost.operator_converters.XGBoost import convert_xgboost
from onnxmltools.convert.lightgbm.operator_converters.LightGbm import convert_lightgbm

# 🌟 1. แก้บั๊ก XGBoost & LightGBM: ลงทะเบียนใหม่แบบคลีนๆ โดยไม่ต้องยัด Option 'nocl' 
try:
    update_registered_converter(XGBClassifier, 'XGBoostXGBClassifier', calculate_linear_classifier_output_shapes, convert_xgboost)
    update_registered_converter(XGBRegressor, 'XGBoostXGBRegressor', calculate_linear_regressor_output_shapes, convert_xgboost)
    update_registered_converter(LGBMClassifier, 'LightGBMLGBMClassifier', calculate_linear_classifier_output_shapes, convert_lightgbm)
    update_registered_converter(LGBMRegressor, 'LightGBMLGBMRegressor', calculate_linear_regressor_output_shapes, convert_lightgbm)
except Exception:
    pass

def load_and_prepare_data(csv_file_path):
    print(f"กำลังอ่านข้อมูลจากไฟล์: {csv_file_path}...")
    df = pd.read_csv(csv_file_path)
    
    required_columns = [
        'timestamp', 'R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean', 
        'env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation', 'label'
    ]
    df_clean = df.dropna(subset=required_columns).copy()
    
    if 'timestamp' in df_clean.columns:
        df_clean['timestamp'] = pd.to_datetime(df_clean['timestamp'])
        df_clean = df_clean.sort_values('timestamp').reset_index(drop=True)
        
    return df_clean

def train_and_evaluate(df):
    features = ['env_temp', 'env_humidity', 'env_precip', 'env_cloudcover', 'env_visibility', 'env_solarradiation']
    X = df[features]
    y_label = df['label']
    y_colors = df[['R_mean', 'G_mean', 'B_mean', 'H_mean', 'S_mean', 'V_mean']]
    
    X_train, X_test, y_label_train, y_label_test, y_colors_train, y_colors_test = train_test_split(
        X, y_label, y_colors, test_size=0.2, shuffle=False
    )

    all_classes = {0, 1, 2, 3}
    missing_classes = all_classes - set(y_label_train.unique())

    if missing_classes:
        print(f"\n⚠️ ข้อมูล Train ขาดกลุ่มสภาพอากาศ: {missing_classes}")
        print("-> กำลังสร้างข้อมูลจำลอง (Dummy Data) เติมให้ครบ 4 กลุ่ม (กลุ่มละ 25 แถว) เพื่อป้องกัน ONNX Error...")
        
        np.random.seed(42)
        for cls in missing_classes:
            dummy_X = pd.concat([X_train.iloc[[0]]] * 25, ignore_index=True)
            dummy_y_colors = pd.concat([y_colors_train.iloc[[0]]] * 25, ignore_index=True)
            
            # 🌟 2. แก้บั๊ก HistGradient: เพิ่มค่า Noise เป็น 0.5 (ให้ความแตกต่างชัดเจนขึ้น)
            noise_X = np.random.normal(0, 0.5, dummy_X.shape)
            dummy_X = dummy_X + noise_X
            
            noise_y = np.random.normal(0, 0.5, dummy_y_colors.shape)
            dummy_y_colors = dummy_y_colors + noise_y
            
            dummy_y_label = pd.Series([cls] * 25)
            
            X_train = pd.concat([X_train, pd.DataFrame(dummy_X, columns=features)], ignore_index=True)
            y_colors_train = pd.concat([y_colors_train, pd.DataFrame(dummy_y_colors, columns=y_colors.columns)], ignore_index=True)
            y_label_train = pd.concat([y_label_train, dummy_y_label], ignore_index=True)

    # 🌟 3. แก้บั๊ก CatBoost: คงรูป DataFrame ของ Pandas ไว้ (ไม่แปลงเป็น Numpy)
    # แต่แปลง y_label ให้เป็น int แบบชัดเจน
    y_label_train = y_label_train.astype(int)
    y_label_test = y_label_test.astype(int)
    
    models = {
        'RandomForest': {
            'clf': RandomForestClassifier(n_estimators=100, random_state=42),
            'reg': RandomForestRegressor(n_estimators=100, random_state=42)
        },
        'HistGradient': {
            'clf': HistGradientBoostingClassifier(random_state=42),
            'reg': MultiOutputRegressor(HistGradientBoostingRegressor(random_state=42))
        },
        'XGBoost': {
            'clf': XGBClassifier(use_label_encoder=False, eval_metric='mlogloss', random_state=42),
            'reg': MultiOutputRegressor(XGBRegressor(random_state=42))
        },
        'LightGBM': {
            'clf': LGBMClassifier(random_state=42, verbose=-1),
            'reg': MultiOutputRegressor(LGBMRegressor(random_state=42, verbose=-1))
        },
        'CatBoost': {
            'clf': CatBoostClassifier(verbose=0, random_state=42),
            'reg': MultiOutputRegressor(CatBoostRegressor(verbose=0, random_state=42))
        }
    }

    trained_models = {}
    target_names_list = ["Clear (0)", "Cloudy (1)", "Gloomy (2)", "Dark (3)"]
    
    print("\nเริ่มกระบวนการ Train โมเดลทั้ง 5 ชนิด...")
    for name, m in models.items():
        print(f"\n" + "="*50)
        print(f"🚀 ผลประเมินโมเดล: {name}")
        print("="*50)
        
        try:
            # ใช้ Pandas DataFrame และ Series โดยตรงในการ Train
            m['clf'].fit(X_train, y_label_train)
            y_label_pred = m['clf'].predict(X_test)
            acc = accuracy_score(y_label_test, y_label_pred)
            
            print(f"🎯 ความแม่นยำสถานะท้องฟ้า (Accuracy): {acc * 100:.2f}%\n")
            
            unique_labels_all = sorted(set(y_label_test) | set(y_label_pred))
            actual_target_names = [target_names_list[i] for i in unique_labels_all]
            
            print("📊 รายละเอียดการแยกคลาส (Classification Report):")
            try:
                print(classification_report(y_label_test, y_label_pred, labels=unique_labels_all, target_names=actual_target_names))
            except Exception:
                print(classification_report(y_label_test, y_label_pred))
            
            print("ตารางเมทริกซ์ความสับสน (Confusion Matrix):")
            cm = confusion_matrix(y_label_test, y_label_pred)
            cm_df = pd.DataFrame(
                cm, 
                index=[f"Actual {n}" for n in actual_target_names], 
                columns=[f"Pred {n}" for n in actual_target_names]
            )
            print(cm_df)
            print("-" * 50)
            
            m['reg'].fit(X_train, y_colors_train)
            y_colors_pred = m['reg'].predict(X_test)
            mae = mean_absolute_error(y_colors_test, y_colors_pred)
            
            print(f"🎨 ความคลาดเคลื่อนสีเฉลี่ยโดยรวม (MAE): +/- {mae:.2f} หน่วย")
            
            trained_models[name] = m
            
        except Exception as e:
            print(f"⚠️ ไม่สามารถ Train โมเดล {name} ได้: {e}")
            print(f"-> ข้ามการสร้างโมเดล {name}")
            continue

    return trained_models

def save_to_onnx(model, filepath, initial_type, timestamp_str):
    try:
        # ใช้ target_opset เบื้องต้น หากไม่ได้ผล onnxmltools จะหาวิธีปรับลดให้เอง
        onnx_model = convert_sklearn(
            model, 
            initial_types=initial_type, 
            target_opset={'': 12, 'ai.onnx.ml': 3}
        )
        
        meta = onnx_model.metadata_props.add()
        meta.key = "creation_time"
        meta.value = timestamp_str
        onnx_model.doc_string = f"Model trained and generated on: {timestamp_str}"
        
        with open(filepath, "wb") as f:
            f.write(onnx_model.SerializeToString())
        return True
    except Exception as e:
        print(f"   ⚠️ ไม่สามารถแปลงเป็น ONNX ได้: {e}")
        return False

if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(BASE_DIR, '..', 'data', 'model_db.csv')
    
    try:
        df_dataset = load_and_prepare_data(csv_path)
        
        if len(df_dataset) < 10:
            print(f"⚠️ ข้อมูลมีน้อยเกินไป (น้อยกว่า 10 รูป) แนะนำให้เก็บเพิ่มก่อน")
        else:
            all_trained_models = train_and_evaluate(df_dataset)
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            initial_type = [('float_input', FloatTensorType([None, 6]))]
            
            print("\n💾 กำลังแปลงและบันทึกไฟล์โมเดลเป็น .onnx ...")
            for model_name, models in all_trained_models.items():
                print(f"\nกำลังประมวลผลเซ็ต: {model_name}")
                
                clf_filename = f"{model_name}_Classifier.onnx"
                reg_filename = f"{model_name}_Regressor.onnx"
                
                clf_path = os.path.join(BASE_DIR, '..', 'data', clf_filename)
                reg_path = os.path.join(BASE_DIR, '..', 'data', reg_filename)
                
                if save_to_onnx(models['clf'], clf_path, initial_type, timestamp):
                    print(f"   ✅ บันทึก {clf_filename} สำเร็จ")
                
                if save_to_onnx(models['reg'], reg_path, initial_type, timestamp):
                    print(f"   ✅ บันทึก {reg_filename} สำเร็จ")
            
            print("\n🎉 กระบวนการสร้างไฟล์โมเดลเสร็จสมบูรณ์!")
            
    except Exception as e:
        print(f"❌ เกิดข้อผิดพลาด: {e}")
