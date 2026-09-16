from datetime import datetime
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests

app = FastAPI(title="Bangsaen Sky Predictor API")

# Mock Database: คลังภาพถ่ายท้องฟ้าจริง (Image Retrieval Database)
# ในระบบจริงจะเปรียบเทียบจาก Feature Vector (RGB/HSV) ใน Database
IMAGE_DATABASE = [
    {
        "id": 1,
        "sky_label": "clear_sky",
        "avg_rgb": [135, 206, 235],
        "image_url": "https://example.com/images/clear_sky_bangsaen.jpg",
    },
    {
        "id": 2,
        "sky_label": "sunset",
        "avg_rgb": [255, 127, 80],
        "image_url": "https://example.com/images/sunset_bangsaen.jpg",
    },
    {
        "id": 3,
        "sky_label": "overcast",
        "avg_rgb": [169, 169, 169],
        "image_url": "https://example.com/images/overcast_bangsaen.jpg",
    },
]


# Structure สำหรับรับค่าจาก Front-end (INPUT)
class PredictionRequest(BaseModel):
    datetime_str: str  # Format: "YYYY-MM-DD HH:MM"


# --- STEP 1: FETCH (Weather Forecast API) ---
def fetch_weather_forecast(dt: datetime) -> dict:
    # สมมุติการยิง API สภาพอากาศล่วงหน้า
    # ในใช้งานจริง: requests.get(f"https://api.weather.com/v1/...&time={dt}")
    return {"temperature_c": 31.5, "humidity": 65, "condition": "Sunny"}


# --- STEP 2: PREDICT (Predict Sky Color with Trained Model) ---
def predict_sky_color(dt: datetime, weather_data: dict) -> list:
    # ในใช้งานจริง: model.predict([dt.hour, weather_data['humidity'], ...])
    # จำลอง Output ค่าสี RGB ที่โมเดลทำนายได้
    hour = dt.hour
    if 6 <= hour < 16:
        return [130, 200, 230]  # ฟ้าสดใส
    elif 16 <= hour <= 18:
        return [240, 120, 70]  # ช่วงพระอาทิตย์ตก
    else:
        return [30, 40, 60]  # กลางคืน/มืด


# --- STEP 3: RETRIEVE (Image Retrieval) ---
def retrieve_matching_image(predicted_rgb: list) -> str:
    # คำนวณ Euclidean Distance หาภาพในคลังที่มีสีใกล้เคียงกับที่ทำนายมากที่สุด
    best_match = None
    min_distance = float("inf")

    for img in IMAGE_DATABASE:
        dist = np.linalg.norm(np.array(predicted_rgb) - np.array(img["avg_rgb"]))
        if dist < min_distance:
            min_distance = dist
            best_match = img["image_url"]

    return best_match


# --- STEP 4: RECOMMENDATION LOGIC ---
def generate_activity_recommendation(weather: dict, rgb: list) -> str:
    if weather["condition"] == "Sunny" and rgb[0] > 200:
        return "เหมาะแก่การเดินเล่นชมพระอาทิตย์ตกดิน และถ่ายรูปริมหาดบางแสน"
    elif weather["condition"] == "Sunny":
        return "เหมาะแก่การเล่นน้ำทะเล พักผ่อนใต้ร่มเตียงผ้าใบ หรือเล่นบานาน่าโบ๊ท"
    else:
        return "แนะนำนั่งพักผ่อนในคาเฟ่ริมหาด หลีกเลี่ยงกิจกรรมกลางแจ้ง"


# --- MAIN PIPELINE (ENDPOINT) ---
@app.post("/predict")
def predict_pipeline(request: PredictionRequest):
    try:
        dt = datetime.strptime(request.datetime_str, "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(
            status_code=400, detail="รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD HH:MM)"
        )

    # 1. Fetch
    weather_info = fetch_weather_forecast(dt)

    # 2. Predict Model Inference
    predicted_rgb = predict_sky_color(dt, weather_info)

    # 3. Image Retrieval
    retrieved_image_url = retrieve_matching_image(predicted_rgb)

    # 4. Activity Recommendation
    recommendation = generate_activity_recommendation(
        weather_info, predicted_rgb
    )

    # 5. OUTPUT
    return {
        "status": "success",
        "output": {
            "weather": weather_info,
            "predicted_sky_color_rgb": predicted_rgb,
            "matched_image_url": retrieved_image_url,
            "activity_recommendation": recommendation,
        },
    }
