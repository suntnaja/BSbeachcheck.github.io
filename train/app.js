// ==========================================
// 1. DATA INGESTION & PREPROCESSING (dmt API)
// ==========================================

// แผนผังการแปลรหัสสภาพอากาศ (cond) เป็นสถานะและกลุ่ม
const weatherConditionMap = {
    1: { text: "แจ่มใส (Clear)", label: 1, icon: "☀️" },
    2: { text: "เมฆบางส่วน (Partly cloudy)", label: 1, icon: "🌤️" },
    3: { text: "เมฆเป็นส่วนมาก (Cloudy)", label: 0, icon: "⛅" },
    4: { text: "มีเมฆมาก (Overcast)", label: 0, icon: "☁️" },
    5: { text: "ฝนตกเล็กน้อย (Light rain)", label: 0, icon: "🌧️" },
    6: { text: "ฝนปานกลาง (Moderate rain)", label: 0, icon: "🌧️" },
    7: { text: "ฝนตกหนัก (Heavy rain)", label: 0, icon: "⛈️" },
    8: { text: "ฝนฟ้าคะนอง (Thunderstorm)", label: 0, icon: "⛈️" },
    9: { text: "อากาศหนาวจัด (Very cold)", label: 1, icon: "❄️" },
    10: { text: "อากาศหนาว (Cold)", label: 1, icon: "❄️" },
    11: { text: "อากาศเย็น (Cool)", label: 1, icon: "🍃" },
    12: { text: "อากาศร้อนจัด (Very hot)", label: 1, icon: "🔥" }
};

// ตัวแปรเก็บขอบเขตเวลา
let dbMinDate = "";
let dbMaxDate = "";

async function fetchDateRangeFromDB() {
    try {
        const response = await fetch('weatherdb.csv'); // ชื่อไฟล์ฐานข้อมูลปัจจุบัน
        if (!response.ok) throw new Error("ไม่พบไฟล์ฐานข้อมูล");
        
        const csvText = await response.text();
        
        // 🌟 ปรับปรุงใหม่: สแกนหาข้อความที่มีรูปแบบ YYYY-MM-DDTHH:MM จากทั้งไฟล์โดยตรง 
        // ไม่ต้องสนใจว่าอยู่คอลัมน์ไหน ตัดปัญหาเรื่อง , หรือ " กวนใจ
        const datePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g;
        const matches = csvText.match(datePattern);
        
        if (matches && matches.length > 0) {
            dbMinDate = matches[0];                     // วันที่ตัวแรกที่เจอในไฟล์
            dbMaxDate = matches[matches.length - 1];    // วันที่ตัวสุดท้ายที่เจอในไฟล์
            
            console.log(`✅ ล็อกปฏิทินเรียบร้อย: ${dbMinDate} ถึง ${dbMaxDate}`);
        } else {
            console.error("❌ ไม่พบรูปแบบวันที่ที่ถูกต้องในไฟล์เลย");
        }
    } catch (err) {
        console.error("❌ การดึงขอบเขตเวลาล้มเหลว:", err);
    }
}

async function fetchHistoricalWeather(datetimeStr) {
    try {
        // 1. จัดการ Format วันที่ให้ตรงกับในไฟล์ CSV (YYYY-MM-DDTHH:00:00)
        const dateObj = new Date(datetimeStr);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hour = String(dateObj.getHours()).padStart(2, '0');
        
        const targetDateStr = `${year}-${month}-${day}T${hour}:00:00`;

        // 2. อ่านไฟล์ CSV 
        const response = await fetch('weatherdb.csv');
        if (!response.ok) throw new Error("ไม่สามารถอ่านไฟล์ weatherdb.csv ได้ (โปรดตรวจสอบว่าไฟล์อยู่ในโฟลเดอร์เดียวกัน)");
        
        const csvText = await response.text();
        const rows = csvText.split('\n');
        const headers = rows[0].split(',');
        
        // หาตำแหน่ง Index
        const dateIdx = headers.indexOf('datetime');
        const tempIdx = headers.indexOf('temp');
        const humidityIdx = headers.indexOf('humidity');
        const precipIdx = headers.indexOf('precip');
        const cloudcoverIdx = headers.indexOf('cloudcover');
        const visibilityIdx = headers.indexOf('visibility');
        const solarIdx = headers.indexOf('solarradiation');
        const condIdx = headers.indexOf('conditions');

        // 🌟 ปรับปรุง: 3. ตรวจสอบขอบเขตเวลา (Min-Max Range Validation)
        let firstDateStr = null;
        let lastDateStr = null;

        // หาเวลาเริ่มต้น (แถวแรกที่มีข้อมูล)
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].trim()) {
                const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (cols.length > dateIdx && cols[dateIdx]) {
                    firstDateStr = cols[dateIdx];
                    break;
                }
            }
        }

        // หาเวลาสิ้นสุด (แถวสุดท้ายที่มีข้อมูล)
        for (let i = rows.length - 1; i >= 1; i--) {
            if (rows[i].trim()) {
                const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (cols.length > dateIdx && cols[dateIdx]) {
                    lastDateStr = cols[dateIdx];
                    break;
                }
            }
        }

        // เช็คว่าเวลาที่ผู้ใช้กรอก อยู่ในขอบเขตหรือไม่
        if (targetDateStr < firstDateStr || targetDateStr > lastDateStr) {
            throw new Error(`อยู่นอกขอบเขตฐานข้อมูล! กรุณาเลือกเวลาใหม่อีกครั้ง\n(ข้อมูลที่มี: ${firstDateStr.replace('T', ' ')} ถึง ${lastDateStr.replace('T', ' ')})`);
        }

        // 4. ค้นหาแถวข้อมูลที่เวลาตรงกัน
        let matchedRow = null;
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i].trim()) continue; 
            const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length > dateIdx && cols[dateIdx] === targetDateStr) {
                matchedRow = cols;
                break;
            }
        }

        if (!matchedRow) {
            throw new Error(`ไม่มีข้อมูลของเวลา ${targetDateStr.replace('T', ' ')} ในไฟล์ CSV`);
        }

        // 5. สกัดข้อมูลตัวแปรที่เกี่ยวข้อง
        const tc = parseFloat(matchedRow[tempIdx]) || 0;
        const rh = parseFloat(matchedRow[humidityIdx]) || 0;
        const precip = parseFloat(matchedRow[precipIdx]) || 0;
        const cloudcover = parseFloat(matchedRow[cloudcoverIdx]) || 0;
        const visibility = parseFloat(matchedRow[visibilityIdx]) || 0;
        const solarradiation = parseFloat(matchedRow[solarIdx]) || 0;
        const conditions_text = (matchedRow[condIdx] || "Unknown").replace(/"/g, ''); 

        // 6. Logic จัดกลุ่มสภาพอากาศแบบ 4 กลุ่มใหม่
        let status = "ฟ้าโปร่ง";
        let label = 0;
        let icon = "☀️";
        const condLower = conditions_text.toLowerCase();

        if (precip > 0 || condLower.includes("rain") || condLower.includes("storm") || (cloudcover > 85 && solarradiation < 100)) {
            status = "ฟ้ามืด"; label = 3; icon = "⛈️";
        } else if (cloudcover > 70 && solarradiation < 300) {
            status = "ฟ้าหม่น"; label = 2; icon = "🌥️";
        } else if (cloudcover >= 30 || (cloudcover > 70 && solarradiation >= 300)) {
            status = "ฟ้ามีเมฆ"; label = 1; icon = "🌤️";
        } else {
            status = "ฟ้าโปร่ง"; label = 0; icon = "☀️";
        }

        return {
            status: status, label: label, icon: icon,
            tc: tc, rh: rh, precip: precip, cloudcover: cloudcover, visibility: visibility, solarradiation: solarradiation,
            conditions_text: conditions_text
        };

    } catch (err) {
        console.error("CSV Read Error:", err);
        
        alert(err.message);
        
        return { 
            status: "Error", label: 0, icon: "❓", 
            tc: 0, rh: 0, precip: 0, cloudcover: 0, visibility: 0, solarradiation: 0, 
            conditions_text: err.message 
        };
    }
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max == min) { h = 0; } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [Math.round(h * 179), Math.round(s * 255), Math.round(v * 255)];
}

// ==========================================
// 2. IMAGE PROCESSING (แปลงไฟล์เป็น JPG)
// ==========================================
// แปลงไฟล์ภาพทุกชนิดเป็น JPG 95% Quality โดยไม่ครอบตัด (คงขนาด Original)
function convertToJPG(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            // วาดภาพต้นฉบับลง Canvas
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            // แปลงเป็น JPG Base64
            const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
            const base64Data = dataUrl.split(',')[1];
            resolve(base64Data);
        };
        img.onerror = reject;
        img.src = objectUrl;
    });
}

// ==========================================
// 3. GLOBAL STATE
// ==========================================
class SkyWeatherModel {
    constructor() {
        this.records = []; // เก็บ Metadata เพื่อรอส่งขึ้น Github
        this.pendingUploads = [];
    }
}
const globalModel = new SkyWeatherModel();

// ==========================================
// 4. User Interface Logic (Events)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {

    fetchDateRangeFromDB(); // ดึงขอบเขตเวลา
    
    // (โค้ด 4.1 และ 4.2 ตรวจจับไฟล์ คงเดิมเหมือนที่เคยทำไว้...)
    
    // ------------------------------------------
    // 4.3 เมื่อกดปุ่มเตรียมข้อมูล (ดึงสภาพอากาศเบื้องต้น + เตรียมอัปโหลด)
    // ------------------------------------------
    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); 
        
        document.getElementById('loadingText').innerText = "กำลังประมวลผล แปลงเป็น JPG และดึงข้อมูลสภาพอากาศ...";
        document.getElementById('loading').style.display = 'block';
        document.getElementById('resultSection').style.display = 'none';

        globalModel.records = [];
        globalModel.pendingUploads = [];
        const tbody = document.getElementById('resultTableBody');
        tbody.innerHTML = ''; 

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const inputTime = inputs[i].value; 
                
                const weatherInfo = await fetchHistoricalWeather(inputTime);
                if (weatherInfo.status === "Error") continue;

                // เปลี่ยนนามสกุลไฟล์ที่อัปโหลดให้เป็น .jpg เสมอ
                const originalName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                const uniqueFilename = `${Date.now()}_${originalName}.jpg`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`; 
                
                // สร้างพรีวิวสำหรับหน้าเว็บ
                const previewUrl = URL.createObjectURL(file);

                // แสดงผลบนหน้าเว็บ (แสดงแค่ข้อมูล ไม่โชว์ค่าสีแล้ว)
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${previewUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:8px;"></td>
                    <td>
                        <div class="fw-bold">${inputTime.replace('T', ' ')}</div>
                        <div class="text-primary">${weatherInfo.status} ${weatherInfo.icon}</div>
                    </td>
                    <td><span class="badge bg-secondary">รอ Python สกัดสีจากภาพเต็ม</span></td>
                    <td>${weatherInfo.label} (กลุ่ม ${weatherInfo.status})</td>
                `;
                tbody.appendChild(row);

                // เก็บ Metadata เพื่อเตรียมต่อท้ายใน raw_metadata.csv
                globalModel.records.push({
                    image_path: fullImagePath,
                    timestamp: inputTime,
                    label: weatherInfo.label
                });

                globalModel.pendingUploads.push({
                    fileData: file,
                    uploadPath: fullImagePath
                });
            }
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('accText').innerText = `✅ เตรียมข้อมูลสำเร็จ กดปุ่ม Save เพื่ออัปโหลดขึ้น GitHub`;
            document.getElementById('resultSection').style.display = 'block';

        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            alert(`เกิดข้อผิดพลาด: ${error.message}`);
        }
    });

    // ------------------------------------------
    // 4.4 เมื่อกด Save ขึ้น GitHub (แปลงไฟล์และอัปโหลด)
    // ------------------------------------------
    document.getElementById('saveModelBtn').addEventListener('click', async function() {
        const owner = document.getElementById('ghOwner').value;
        const repo = document.getElementById('ghRepo').value;
        const path = document.getElementById('ghPath').value.replace('.json', '.csv'); // บังคับเซฟเป็น CSV
        const token = document.getElementById('ghToken').value;

        if(!owner || !repo || !token) return alert("กรุณากรอกข้อมูล GitHub ให้ครบ");
        document.getElementById('loading').style.display = 'block';
        
        try {
            const totalFiles = globalModel.pendingUploads.length;
            
            // 1. แปลงรูปเป็น JPG และอัปโหลด
            for (let i = 0; i < totalFiles; i++) {
                document.getElementById('loadingText').innerText = `กำลังแปลงไฟล์และอัปโหลดรูปภาพที่ ${i+1}/${totalFiles}...`;
                const uploadItem = globalModel.pendingUploads[i];
                
                // แปลงไฟล์เป็น JPG Base64 ทันทีก่อนอัปโหลด
                const base64Jpg = await convertToJPG(uploadItem.fileData);
                
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${uploadItem.uploadPath}`;
                await fetch(url, {
                    method: "PUT",
                    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: `Upload JPG image via ML Web UI`, content: base64Jpg })
                });
            }

            // 2. อัปเดตไฟล์ข้อมูลภาพตั้งต้น (raw_metadata.csv)
            document.getElementById('loadingText').innerText = "กำลังอัปเดตไฟล์ข้อมูล (CSV)...";
            const dbUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
            const headers = { "Authorization": `token ${token}`, "Content-Type": "application/json" };
            
            let sha = null;
            let existingCsv = "image_path,timestamp\n"; // Header เริ่มต้น

            try {
                const getRes = await fetch(dbUrl, { headers });
                if (getRes.ok) {
                    const getJson = await getRes.json();
                    sha = getJson.sha; 
                    // Decode Base64 ของ CSV ที่มีอยู่เดิม
                    existingCsv = decodeURIComponent(escape(atob(getJson.content)));
                }
            } catch (e) { console.log("สร้างไฟล์ CSV ใหม่"); }

            // นำข้อมูลใหม่ต่อท้าย CSV
            let newRows = globalModel.records.map(r => `${r.image_path},${r.timestamp}`).join('\n');
            if (newRows) newRows = (existingCsv.endsWith('\n') ? '' : '\n') + newRows + '\n';
            const combinedCsv = existingCsv + newRows;

            const base64Content = btoa(unescape(encodeURIComponent(combinedCsv)));
            const putBody = { message: `Update metadata DB`, content: base64Content };
            if (sha) putBody.sha = sha; 

            const putRes = await fetch(dbUrl, { method: "PUT", headers, body: JSON.stringify(putBody) });

            if(putRes.ok) {
                alert(`☁️ อัปโหลดเสร็จสมบูรณ์! ไฟล์ทั้งหมดถูกลดขนาดเป็น JPG แล้ว`);
            } else {
                alert("❌ เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล");
            }
        } catch(e) { 
            alert("❌ Error: " + e.message); 
        }
        document.getElementById('loading').style.display = 'none';
    });
});
