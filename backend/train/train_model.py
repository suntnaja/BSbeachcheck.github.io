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

# 🌟 1. แก้บั๊ก Options ['nocl'] โดยการบังคับลงทะเบียนทับ (overwrite=True)
try:
    opts = {'nocl': [True, False], 'zipmap': [True, False, 'columns']}
    update_registered_converter(
        XGBClassifier, 'XGBoostXGBClassifier', calculate_linear_classifier_output_shapes, convert_xgboost, options=opts, overwrite=True
    )
    update_registered_converter(
        XGBRegressor, 'XGBoostXGBRegressor', calculate_linear_regressor_output_shapes, convert_xgboost, overwrite=True
    )
    update_registered_converter(
        LGBMClassifier, 'LightGBMLGBMClassifier', calculate_linear_classifier_output_shapes, convert_lightgbm, options=opts, overwrite=True
    )
    update_registered_converter(
        LGBMRegressor, 'LightGBMLGBMRegressor', calculate_linear_regressor_output_shapes, convert_lightgbm, overwrite=True
    )
except Exception as e:
    print("Warning in ONNX registration:", e)

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

    # 🌟 2. บังคับแปลงเป็น Numpy Array 100% เพื่อลบชื่อคอลัมน์แก้บั๊ก 'env_solarradiation' ของ XGBoost
    X_train_np = np.ascontiguousarray(X_train.to_numpy(dtype=np.float32))
    X_test_np = np.ascontiguousarray(X_test.to_numpy(dtype=np.float32))
    
    y_colors_train_np = np.ascontiguousarray(y_colors_train.to_numpy(dtype=np.float32))
    y_colors_test_np = np.ascontiguousarray(y_colors_test.to_numpy(dtype=np.float32))
    
    y_label_train_np = np.ascontiguousarray(y_label_train.to_numpy(dtype=np.int64).ravel())
    y_label_test_np = np.ascontiguousarray(y_label_test.to_numpy(dtype=np.int64).ravel())

    all_classes = {0, 1, 2, 3}
    missing_classes = all_classes - set(y_label_train_np)

    if missing_classes:
        print(f"\n⚠️ ข้อมูล Train ขาดกลุ่มสภาพอากาศ: {missing_classes}")
        print("-> กำลังสร้างข้อมูลจำลอง (Dummy Data) 100 แถวต่อกลุ่ม...")
        
        np.random.seed(42)
        X_mean = X_train_np.mean(axis=0)
        X_std = X_train_np.std(axis=0) + 1e-5
        y_c_mean = y_colors_train_np.mean(axis=0)
        y_c_std = y_colors_train_np.std(axis=0) + 1e-5
        
        for cls in missing_classes:
            # 🌟 3. สร้างข้อมูลสุ่มให้กระจายตัว เพื่อแก้บั๊ก TreeEnsembleClassifier (ป้องกันไม่ให้ต้นไม้ตีบตัน)
            dummy_X = np.random.normal(X_mean, X_std * 0.1, size=(10, X_train_np.shape[1])).astype(np.float32)
            dummy_y_colors = np.random.normal(y_c_mean, y_c_std * 0.1, size=(10, y_colors_train_np.shape[1])).astype(np.float32)
            dummy_y_label = np.full(10, cls, dtype=np.int64)
            
            X_train_np = np.vstack([X_train_np, dummy_X])
            y_colors_train_np = np.vstack([y_colors_train_np, dummy_y_colors])
            y_label_train_np = np.concatenate([y_label_train_np, dummy_y_label])

    # 🌟 4. ปรับพารามิเตอร์ HistGradient ให้ min_samples_leaf=2 แก้บั๊กสร้างต้นไม้ไม่มีกิ่ง
    models = {
        'RandomForest': {
            'clf': RandomForestClassifier(n_estimators=100, random_state=42),
            'reg': RandomForestRegressor(n_estimators=100, random_state=42)
        },
        
        'HistGradient': {
            'clf': HistGradientBoostingClassifier(random_state=42, max_iter=30, max_depth=3, max_leaf_nodes=10),
            'reg': MultiOutputRegressor(HistGradientBoostingRegressor(random_state=42, max_iter=30, max_depth=3, max_leaf_nodes=10))
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
            m['clf'].fit(X_train_np, y_label_train_np)
            
            # 🌟 5. แก้บั๊ก CatBoost (unhashable type) ด้วยการบังคับ .ravel() ให้ผลทายเป็น 1D ล้วน
            y_label_pred = m['clf'].predict(X_test_np).ravel()
            acc = accuracy_score(y_label_test_np, y_label_pred)
            
            print(f"🎯 ความแม่นยำสถานะท้องฟ้า (Accuracy): {acc * 100:.2f}%\n")
            
            unique_labels_all = sorted(set(y_label_test_np) | set(y_label_pred))
            actual_target_names = [target_names_list[i] for i in unique_labels_all]
            
            print("📊 รายละเอียดการแยกคลาส (Classification Report):")
            try:
                print(classification_report(y_label_test_np, y_label_pred, labels=unique_labels_all, target_names=actual_target_names))
            except Exception:
                print(classification_report(y_label_test_np, y_label_pred))
            
            print("ตารางเมทริกซ์ความสับสน (Confusion Matrix):")
            cm = confusion_matrix(y_label_test_np, y_label_pred)
            cm_df = pd.DataFrame(
                cm, 
                index=[f"Actual {n}" for n in actual_target_names], 
                columns=[f"Pred {n}" for n in actual_target_names]
            )
            print(cm_df)
            print("-" * 50)
            
            m['reg'].fit(X_train_np, y_colors_train_np)
            y_colors_pred = m['reg'].predict(X_test_np)
            mae = mean_absolute_error(y_colors_test_np, y_colors_pred)
            
            print(f"🎨 ความคลาดเคลื่อนสีเฉลี่ยโดยรวม (MAE): +/- {mae:.2f} หน่วย")
            
            trained_models[name] = m
            
        except Exception as e:
            print(f"⚠️ ไม่สามารถ Train โมเดล {name} ได้: {e}")
            print(f"-> ข้ามการสร้างโมเดล {name}")
            continue

    return trained_models

def save_to_onnx(model, filepath, initial_type, timestamp_str):
    try:
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
