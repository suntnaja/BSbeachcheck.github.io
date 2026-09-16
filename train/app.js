// ==========================================
// 1. DATA INGESTION & PREPROCESSING (OpenWeatherMap API)
// ==========================================
const API_KEY = "bd5e378503939ddaee76f12ad7a97608";
const LAT = 13.29; // พิกัดละติจูด หาดบางแสน
const LON = 100.91; // พิกัดลองจิจูด หาดบางแสน

async function fetchHistoricalWeather(datetimeStr) {
    try {
        // OpenWeatherMap ใช้ระบบเวลาแบบ Unix Timestamp (วินาที)
        const dateObj = new Date(datetimeStr);
        const unixTime = Math.floor(dateObj.getTime() / 1000);

        // URL ดึงข้อมูลประวัติศาสตร์ (Timemachine Endpoint ของ OpenWeatherMap)
        // หมายเหตุ: หาก API Key เป็นแบบฟรีที่เพิ่งสมัคร อาจต้องใช้ Endpoint /data/2.5/weather สำหรับข้อมูลปัจจุบันแทนหากถูกจำกัดสิทธิ์ historical
        const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${LAT}&lon=${LON}&dt=${unixTime}&appid=${API_KEY}&units=metric`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("ไม่สามารถเชื่อมต่อ OpenWeatherMap API ได้");
        
        const json = await response.json();
        const data = json.data[0]; // ข้อมูลสภาพอากาศจะอยู่ใน array ตำแหน่งแรก
        
        // ดึงตัวแปรที่ส่งผลต่อสีท้องฟ้าจาก OpenWeatherMap
        const cloudcover = data.clouds || 0; 
        const visibility = (data.visibility || 0) / 1000; // แปลงจากเมตรเป็นกิโลเมตร
        const humidity = data.humidity || 0;
        
        // ตรวจสอบปริมาณฝน (OpenWeatherMap จะคืนค่าฝนในอ็อบเจกต์ rain.1h)
        let precip = 0;
        if (data.rain && data.rain['1h']) {
            precip = data.rain['1h'];
        }

        // ดึงคำอธิบายสภาพอากาศหลัก เช่น "Clear", "Clouds", "Rain"
        const conditionsMain = data.weather && data.weather.length > 0 ? data.weather[0].main : "Unknown";
        const conditionsDesc = data.weather && data.weather.length > 0 ? data.weather[0].description : "Unknown";

        // ==========================================
        // Logic จัดกลุ่มสภาพอากาศแบบใหม่ (ปรับให้เข้ากับ OWM)
        // ==========================================
        let status = "Clear";
        let label = 1;
        let icon = "☀️";
        
        if (precip > 0 || conditionsMain === "Rain" || conditionsMain === "Thunderstorm") {
            // 1. ถ้ามีฝนตก หรือสถานะแจ้งว่าพายุ/ฝน = หม่นแน่นอน
            status = "Gloomy";
            label = 0;
            icon = "🌧️";
        } else if (cloudcover > 70 && conditionsMain === "Clouds") {
            // 2. ถ้าเมฆเกิน 70% และ OWM ฟันธงว่าเป็นกลุ่มเมฆ (Clouds) = ฟ้าหม่น
            status = "Gloomy";
            label = 0;
            icon = "☁️";
        } else {
            // 3. นอกนั้นถือว่าฟ้าใส (แม้เมฆจะเยอะแต่ถ้าไม่มีฝนและอากาศปรอดโปร่ง)
            status = "Clear";
            label = 1;
            icon = "☀️";
        }
        
        return {
            status: status,
            label: label,
            icon: icon,
            cloudcover: cloudcover,
            visibility: visibility,
            humidity: humidity,
            precip: precip,
            solarradiation: 0, // OWM แบบฟรีไม่มีค่านี้ กำหนดเป็น 0 ไว้เพื่อไม่ให้ตารางพัง
            conditions_text: conditionsDesc
        };
    } catch (err) {
        console.error(err);
        return { 
            status: "Error", label: 1, icon: "❓", 
            cloudcover: 0, visibility: 0, humidity: 0, precip: 0, solarradiation: 0, conditions_text: "API Error" 
        };
    }
}
