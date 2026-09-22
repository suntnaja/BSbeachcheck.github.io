from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import numpy as np

app = Flask(__name__)
CORS(app) # อนุญาตให้ HTML ยิง API เข้ามาได้

# โหลดไฟล์ โมเดล .pkl (สมมติชื่อ model.pkl)
with open('data/sky_weather_rf_model.pkl', 'rb') as file:
    model = pickle.load(file)

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    
    # ดึงค่าตาม feature ที่โมเดลต้องการ: อุณหภูมิ, ความชื้น, ปริมาณฝน, เมฆ, ทัศนวิสัย, รังสี
    features = np.array([[
        data['temp'], 
        data['humidity'], 
        data['precip'], 
        data['cloudcover'], 
        data['visibility'], 
        data['solarradiation']
    ]])
    
    # สั่งให้โมเดลทำนาย
    # ** โค้ดส่วนนี้อาจต้องปรับตามโครงสร้างผลลัพธ์ของ model.pkl คุณ (คืนค่าเป็น array ของสี หรือ label อย่างใดอย่างหนึ่ง)
    # ตัวอย่างเช่น สมมติโมเดลให้ค่า Label เป็นตัวแรก และ RGB เป็นตัวถัดมา
    prediction = model.predict(features)
    
    # สมมติโมเดลคืนค่า [Label, R, G, B]
    result_label = int(prediction[0][0])
    result_rgb = [float(prediction[0][1]), float(prediction[0][2]), float(prediction[0][3])]
    
    return jsonify({
        "label": result_label,
        "rgb": result_rgb
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
