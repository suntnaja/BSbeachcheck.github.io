from datetime import datetime
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware  # นำเข้า CORSMiddleware สำหรับแก้ปัญหา Cross-Origin
from pydantic import BaseModel

app = FastAPI(title="Bangsaen Sky Predictor API")

# --- เพิ่ม CORS Middleware เพื่ออนุญาตให้ GitHub Pages ยิง API เข้ามาได้ ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # อนุญาตทุกโดเมน (รวมถึง GitHub Pages)
    allow_credentials=True,
    allow_methods=["*"],  # อนุญาตทุก HTTP Methods (GET, POST, ฯลฯ)
    allow_headers=["*"],
)

# Mock Database: คลังภาพถ่ายท้องฟ้าจริง (Image Retrieval Database)
# ใช้ URL ภาพจริงจาก Unsplash เพื่อให้แสดงผลบนหน้าเว็บได้จริง
IMAGE_DATABASE = [
    {
        "id": 1,
        "sky_label": "clear_sky",
        "avg_rgb": [130, 200, 230],
        "image_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": 2,
        "sky_label": "sunset",
        "avg_rgb": [240, 120, 70],
        "image_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
    },
    {
        "id": 3,
        "sky_label": "night",
        "avg_rgb": [30, 40, 60],
        "image_url": "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=800&q=80",
    },
]


# Structure สำหรับรับค่าจาก Front-end (INPUT)
class PredictionRequest(BaseModel):
    datetime_str: str  # Format: "YYYY-MM-DD HH:MM"


# --- STEP 1: FETCH (Weather Forecast API) ---
def fetch_weather_forecast(dt: datetime) -> dict:
    # สมมุติการยิง API สภาพอากาศล่วงหน้า
    return {"temperature_c": 31.5, "humidity": 65, "condition": "Sunny"}


# --- STEP 2: PREDICT (Predict Sky Color with Trained Model) ---
def predict_sky_color(dt: datetime, weather_data: dict) -> list:
    # จำลอง Output ค่าสี RGB ที่โมเดลทำนายได้ตามช่วงเวลา
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
    elif weather["condition"] == "Sunny" and rgb[2] > 200:
        return "เหมาะแก่การเล่นน้ำทะเล พักผ่อนใต้ร่มเตียงผ้าใบ หรือเล่นบานาน่าโบ๊ท"
    else:
        return "แนะนำนั่งพักผ่อนในคาเฟ่ริมหาด ชมบรรยากาศยามค่ำคืน"


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
