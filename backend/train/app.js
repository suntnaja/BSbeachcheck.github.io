// ==========================================
// 1. DATA INGESTION & PREPROCESSING (dmt API)
// ==========================================

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

let dbMinDate = "";
let dbMaxDate = "";

async function fetchDateRangeFromDB() {
    try {
        const response = await fetch('../data/weatherdb.csv');
        if (!response.ok) throw new Error("ไม่พบไฟล์ฐานข้อมูล");
        
        const csvText = await response.text();
        const datePattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g;
        const matches = csvText.match(datePattern);
        
        if (matches && matches.length > 0) {
            dbMinDate = matches[0];
            dbMaxDate = matches[matches.length - 1];
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
        const dateObj = new Date(datetimeStr);
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const hour = String(dateObj.getHours()).padStart(2, '0');
        const targetDateStr = `${year}-${month}-${day}T${hour}:00:00`;

        const response = await fetch('../data/weatherdb.csv');
        if (!response.ok) throw new Error("ไม่สามารถอ่านไฟล์ weatherdb.csv ได้");
        
        const csvText = await response.text();
        const rows = csvText.split('\n');
        const headers = rows[0].split(',');
        
        const dateIdx = headers.indexOf('datetime');
        const tempIdx = headers.indexOf('temp');
        const humidityIdx = headers.indexOf('humidity');
        const precipIdx = headers.indexOf('precip');
        const cloudcoverIdx = headers.indexOf('cloudcover');
        const visibilityIdx = headers.indexOf('visibility');
        const solarIdx = headers.indexOf('solarradiation');
        const condIdx = headers.indexOf('conditions');

        let firstDateStr = null;
        let lastDateStr = null;

        for (let i = 1; i < rows.length; i++) {
            if (rows[i].trim()) {
                const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (cols.length > dateIdx && cols[dateIdx]) {
                    firstDateStr = cols[dateIdx];
                    break;
                }
            }
        }

        for (let i = rows.length - 1; i >= 1; i--) {
            if (rows[i].trim()) {
                const cols = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                if (cols.length > dateIdx && cols[dateIdx]) {
                    lastDateStr = cols[dateIdx];
                    break;
                }
            }
        }

        if (targetDateStr < firstDateStr || targetDateStr > lastDateStr) {
            throw new Error(`อยู่นอกขอบเขตฐานข้อมูล! กรุณาเลือกเวลาใหม่อีกครั้ง\n(ข้อมูลที่มี: ${firstDateStr.replace('T', ' ')} ถึง ${lastDateStr.replace('T', ' ')})`);
        }

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

        const tc = parseFloat(matchedRow[tempIdx]) || 0;
        const rh = parseFloat(matchedRow[humidityIdx]) || 0;
        const precip = parseFloat(matchedRow[precipIdx]) || 0;
        const cloudcover = parseFloat(matchedRow[cloudcoverIdx]) || 0;
        const visibility = parseFloat(matchedRow[visibilityIdx]) || 0;
        const solarradiation = parseFloat(matchedRow[solarIdx]) || 0;
        const conditions_text = (matchedRow[condIdx] || "Unknown").replace(/"/g, ''); 

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

// ==========================================
// 2. IMAGE PROCESSING (แปลงไฟล์เป็น JPG)
// ==========================================
function convertToJPG(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
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
        this.records = []; 
        this.pendingUploads = [];
    }
}
const globalModel = new SkyWeatherModel();

// ==========================================
// 4. User Interface Logic (Events)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {

    fetchDateRangeFromDB();
    
    // ------------------------------------------
    // 4.1 ตรวจจับการเลือกไฟล์ภาพ (รวมเป็นฟังก์ชันเดียว)
    // ------------------------------------------
    document.getElementById('images').addEventListener('change', function(e) {
        const files = e.target.files;
        const container = document.getElementById('fileListContainer');
        const section = document.getElementById('dateTimeInputSection');
        container.innerHTML = '';
        
        if (files.length > 0) {
            section.style.display = 'block';
            Array.from(files).forEach((file, index) => {
                
                const previewUrl = URL.createObjectURL(file);
                
                container.innerHTML += `
                <div class="d-flex align-items-center justify-content-between mb-3 p-3 border rounded bg-white shadow-sm">
                    <div class="d-flex align-items-center" style="max-width: 55%; overflow: hidden;">
                        <img src="${previewUrl}" class="rounded me-3 border" style="width: 70px; height: 70px; object-fit: cover;" alt="preview">
                        <span class="fw-bold text-truncate" title="${file.name}">${file.name}</span>
                    </div>
                    <input type="datetime-local" class="form-control datetime-input" data-index="${index}" style="max-width: 40%;" min="${dbMinDate}" max="${dbMaxDate}" required>
                </div>`;
            });

            const dateInputs = document.querySelectorAll('.datetime-input');
            dateInputs.forEach(input => {
                input.addEventListener('change', function() {
                    if (dbMinDate && dbMaxDate) {
                        if (this.value < dbMinDate || this.value > dbMaxDate) {
                            alert(`⚠️ วันที่อยู่นอกขอบเขตฐานข้อมูล!\n\nกรุณาเลือกเวลาในช่วง:\n${dbMinDate.replace('T', ' ')} ถึง ${dbMaxDate.replace('T', ' ')}`);
                            this.value = ''; 
                            setTimeout(() => this.focus(), 10); 
                        }
                    }
                });
            });

        } else { 
            section.style.display = 'none'; 
        }
    });
    
    // ------------------------------------------
    // 4.2 เมื่อกดปุ่มเตรียมข้อมูล
    // ------------------------------------------
    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        
        // 🌟 ตั้งชื่อโฟลเดอร์สำหรับเก็บภาพแบบอัตโนมัติ
        const imgFolder = "images"; 
        
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

                const safeTimeStr = inputTime.replace(/:/g, '_');
                const uniqueFilename = `${safeTimeStr}.jpg`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`;
                
                const previewUrl = URL.createObjectURL(file);

                let badgeClass = "";
                let badgeText = "";
                switch(weatherInfo.label) {
                    case 0: badgeClass = "bg-primary text-white"; badgeText = "กลุ่ม 0 (ฟ้าโปร่ง)"; break;
                    case 1: badgeClass = "bg-info text-dark"; badgeText = "กลุ่ม 1 (ฟ้ามีเมฆ)"; break;
                    case 2: badgeClass = "bg-secondary text-white"; badgeText = "กลุ่ม 2 (ฟ้าหม่น)"; break;
                    case 3: badgeClass = "bg-dark text-white"; badgeText = "กลุ่ม 3 (ฟ้ามืด)"; break;
                }

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        <img src="${previewUrl}" style="width:70px; height:70px; object-fit:cover; border-radius:8px; border: 1px solid #ddd;">
                    </td>
                    <td>
                        <div class="fw-bold text-muted" style="font-size: 0.85em;">${inputTime.replace('T', ' ')}</div>
                        <div class="fw-bold mt-1 text-primary">${weatherInfo.status} ${weatherInfo.icon}</div>
                        <div style="font-size: 0.8em; color: #555; margin-top: 4px;">
                            🌡️️ อุณหภูมิ: ${weatherInfo.tc}°C | 💧 ความชื้น: ${weatherInfo.rh}%<br>
                            🌧️ ปริมาณฝน: ${weatherInfo.precip} mm | ☀️ รังสี: ${weatherInfo.solarradiation} W/m²<br>
                            ☁️ เมฆปกคลุม: ${weatherInfo.cloudcover}% | 👀 ทัศนวิสัย: ${weatherInfo.visibility} km
                        </div>
                    </td>
                    <td class="text-center align-middle">
                        <span class="badge ${badgeClass} px-3 py-2">${badgeText}</span>
                    </td>
                `;
                tbody.appendChild(row);

                globalModel.pendingUploads.push({
                    fileData: file,
                    uploadPath: fullImagePath
                });
            }
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('accText').innerText = `✅ เตรียมข้อมูลสำเร็จ กดปุ่มยืนยัน เพื่ออัปโหลดขึ้น GitHub`;
            document.getElementById('resultSection').style.display = 'block';

        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            alert(`เกิดข้อผิดพลาด: ${error.message}`);
        }
    });

    // ------------------------------------------
    // 4.3 เมื่อกด Save ขึ้น GitHub (แปลงไฟล์และอัปโหลด)
    // ------------------------------------------
    document.getElementById('saveModelBtn').addEventListener('click', async function() {
        
        // กำหนดค่า Owner และ Repo ฝังไว้ได้เลย (เพราะไม่ใช่ความลับ)
        const owner = "suntnaja";
        const repo = "BSbeachcheck.github.io";
        
        // 🌟 ระบบดึง Token จากความจำเบราว์เซอร์
        let token = localStorage.getItem('ghToken');
        
        // ถ้าไม่มี Token (เพิ่งเข้าเว็บครั้งแรก) ระบบจะเด้งหน้าต่างให้กรอก
        if (!token) {
            token = prompt("🔒 เพื่อความปลอดภัย GitHub ไม่อนุญาตให้ฝังรหัสไว้ในเว็บ\n\nกรุณากรอก GitHub Token ของคุณ (ระบบจะจำไว้เฉพาะในเครื่องนี้):");
            if (!token) return alert("❌ ต้องใช้ Token ในการอัปโหลดไฟล์ครับ");
            
            // เซฟเก็บไว้ในเครื่อง
            localStorage.setItem('ghToken', token);
        }

        document.getElementById('loading').style.display = 'block';
        
        try {
            const totalFiles = globalModel.pendingUploads.length;
            
            for (let i = 0; i < totalFiles; i++) {
                document.getElementById('loadingText').innerText = `กำลังแปลงไฟล์และอัปโหลดรูปภาพที่ ${i+1}/${totalFiles}...`;
                const uploadItem = globalModel.pendingUploads[i];
                const base64Jpg = await convertToJPG(uploadItem.fileData);
                
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${uploadItem.uploadPath}`;
                let sha = null;
                try {
                    const getRes = await fetch(url, { headers: { "Authorization": `token ${token}` } });
                    if (getRes.ok) {
                        const fileData = await getRes.json();
                        sha = fileData.sha; 
                    }
                } catch (e) {
                    console.log("Creating new file.");
                }

                const payload = {
                    message: `Upload image ${uploadItem.uploadPath}`,
                    content: base64Jpg
                };
                if (sha) payload.sha = sha; 

                const response = await fetch(url, {
                    method: "PUT",
                    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                    // 🌟 ถ้าอัปโหลดไม่ผ่าน (เช่น Token หมดอายุ/โดนแบน) ให้ลบความจำเดิมทิ้ง
                    if(response.status === 401) {
                        localStorage.removeItem('ghToken');
                        throw new Error("Token ไม่ถูกต้อง หรือหมดอายุ (กรุณากดอัปโหลดใหม่อีกครั้งเพื่อกรอก Token ใหม่)");
                    }
                    const errorMsg = await response.text();
                    throw new Error(errorMsg);
                }
            }

            alert(`☁️ อัปโหลดเสร็จสมบูรณ์! ไฟล์รูปภาพถูกส่งขึ้น GitHub แล้ว`);
            document.getElementById('trainForm').reset();
            document.getElementById('fileListContainer').innerHTML = '';
            document.getElementById('dateTimeInputSection').style.display = 'none';
            document.getElementById('resultSection').style.display = 'none';

        } catch(e) { 
            alert("❌ Error: " + e.message); 
        }
        document.getElementById('loading').style.display = 'none';
    });
});
