// ==========================================
// 1. DATA INGESTION & PREPROCESSING (Visual Crossing API)
// ==========================================
const API_KEY = "XK3URSVCSGXCGR8N9FJR69Z4Q";
const LAT = 13.29; // พิกัดละติจูด หาดบางแสน
const LON = 100.91; // พิกัดลองจิจูด หาดบางแสน

async function fetchHistoricalWeather(datetimeStr) {
    try {
        // แปลงวันที่จากฟอร์ม (เช่น 2023-10-01T14:30) เป็นรูปแบบที่ API ต้องการ
        const dateObj = new Date(datetimeStr);
        const dateStr = dateObj.toISOString().split('T')[0]; // ได้ "YYYY-MM-DD"
        const hourStr = dateObj.getHours().toString().padStart(2, '0') + ":00:00"; // ได้ "HH:00:00"

        // URL ดึงข้อมูลแบบ Timeline ระบุพิกัด วันที่ และขอข้อมูลรายชั่วโมง (include=hours)
        const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${LAT},${LON}/${dateStr}?unitGroup=metric&key=${API_KEY}&include=hours`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("ไม่สามารถเชื่อมต่อ Weather API ได้");
        
        const data = await response.json();
        
        // ค้นหาข้อมูลสภาพอากาศของชั่วโมงนั้นๆ
        const dayData = data.days[0];
        const hourData = dayData.hours.find(h => h.datetime === hourStr) || dayData.hours[12]; // ถ้าหาไม่เจอใช้เที่ยงวันแทน
        
        // ดึงตัวแปรที่ส่งผลต่อสีท้องฟ้า
        const cloudcover = hourData.cloudcover || 0;
        const visibility = hourData.visibility || 0;
        const humidity = hourData.humidity || 0;
        const precip = hourData.precip || 0;
        const solarradiation = hourData.solarradiation || 0;
        const conditions = hourData.conditions || "Unknown";
        
        // สร้าง Logic จำแนกกลุ่มสภาพอากาศเบื้องต้น (Labeling)
        // ถ้าเมฆเกิน 60% หรือมีฝนตก ให้เป็นกลุ่มฟ้าหม่น (0)
        let status = "Clear";
        let label = 1;
        let icon = "☀️";
        
        if (precip > 0) {
            // 1. ถ้าฝนตก = หม่นแน่นอน (ฝนตก ฟ้าปิด)
            status = "Gloomy";
            label = 0;
            icon = "🌧️";
        } else if (cloudcover > 60 && solarradiation < 400) {
            // 2. เมฆเยอะ (เกิน 60%) **และ** แสงแดดน้อย (รังสีต่ำกว่า 400 W/m²) = ฟ้าหม่น
            status = "Gloomy";
            label = 0;
            icon = "☁️";
        } else {
            // 3. นอกนั้น (รวมถึงเคสเมฆ 76% แต่รังสี 699) ให้ถือว่าฟ้ายังใสสว่างอยู่
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
            solarradiation: solarradiation,
            conditions_text: conditions
        };
    } catch (err) {
        console.error(err);
        // Fallback กรณี API ล่มหรือไม่คืนค่า
        return { 
            status: "Error", label: 1, icon: "❓", 
            cloudcover: 0, visibility: 0, humidity: 0, precip: 0, solarradiation: 0, conditions_text: "API Error" 
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
// 2. FEATURES (สกัดข้อมูลสีท้องฟ้า)
// ==========================================
function extractSkyColors(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = function() {
            try {
                const canvas = document.getElementById('hiddenCanvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 400; canvas.height = 300;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const skyHeight = Math.floor(canvas.height * 0.3);
                const data = ctx.getImageData(0, 0, canvas.width, skyHeight).data;
                
                let rSum = 0, gSum = 0, bSum = 0;
                let count = data.length / 4;
                for (let i = 0; i < data.length; i += 4) { 
                    rSum += data[i]; gSum += data[i+1]; bSum += data[i+2]; 
                }
                
                let rMean = rSum / count;
                let gMean = gSum / count;
                let bMean = bSum / count;
                let [hMean, sMean, vMean] = rgbToHsv(rMean, gMean, bMean);

                resolve({
                    R_mean: parseFloat(rMean.toFixed(2)),
                    G_mean: parseFloat(gMean.toFixed(2)),
                    B_mean: parseFloat(bMean.toFixed(2)),
                    H_mean: hMean, S_mean: sMean, V_mean: vMean,
                    previewUrl: objectUrl
                });
            } catch (err) { reject(err); }
        };

        img.onerror = function() {
            reject(new Error(`ไม่สามารถอ่านไฟล์ภาพ ${file.name} ได้`));
        };
        img.src = objectUrl;
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

// ==========================================
// 3. Simple ML Model & Global State
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
    
    document.getElementById('images').addEventListener('change', function(e) {
        const files = e.target.files;
        const container = document.getElementById('fileListContainer');
        const section = document.getElementById('dateTimeInputSection');
        container.innerHTML = '';
        
        if (files.length > 0) {
            section.style.display = 'block';
            Array.from(files).forEach((file, index) => {
                container.innerHTML += `
                <div class="d-flex align-items-center justify-content-between mb-2 p-3 border rounded bg-white shadow-sm">
                    <span class="fw-bold text-truncate me-2" style="max-width: 50%;">${file.name}</span>
                    <input type="datetime-local" class="form-control datetime-input" data-index="${index}" style="max-width: 45%;" required>
                </div>`;
            });
        } else { section.style.display = 'none'; }
    });

    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); 
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสี และดึงข้อมูลจาก Visual Crossing API...";
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
                
                // สกัดสี และ ดึง API ขนานกันเพื่อความรวดเร็ว
                const [color, weatherInfo] = await Promise.all([
                    extractSkyColors(file),
                    fetchHistoricalWeather(inputTime)
                ]);
                
                const uniqueFilename = `${Date.now()}_${file.name}`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`; 

                const badgeClass = weatherInfo.label === 1 ? "bg-warning text-dark" : "bg-secondary";
                const badgeText = weatherInfo.label === 1 ? "กลุ่ม 1 (ฟ้าโปร่ง)" : "กลุ่ม 0 (ฟ้าหม่น)";

                // วาดแถวตาราง เพิ่มการแสดงผลข้อมูลอากาศที่ดึงมา
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${color.previewUrl}" class="thumbnail-img"></td>
                    <td>
                        <div class="fw-bold text-muted" style="font-size: 0.85em;">${inputTime.replace('T', ' ')}</div>
                        <div class="fw-bold mt-1">${weatherInfo.status} ${weatherInfo.icon}</div>
                        <div style="font-size: 0.8em; color: #666;">
                            เมฆ: ${weatherInfo.cloudcover}% | ชื้น: ${weatherInfo.humidity}%<br>
                            ทัศนวิสัย: ${weatherInfo.visibility}km | รังสี: ${weatherInfo.solarradiation}
                        </div>
                    </td>
                    <td>
                        <span style="color: #d9534f; font-weight: bold;">R: ${color.R_mean}</span><br>
                        <span style="color: #5cb85c; font-weight: bold;">G: ${color.G_mean}</span><br>
                        <span style="color: #5bc0de; font-weight: bold;">B: ${color.B_mean}</span>
                    </td>
                    <td><span class="badge ${badgeClass} px-3 py-2">${badgeText}</span></td>
                `;
                tbody.appendChild(row);

                // บันทึกตัวแปรทั้งหมดลงฐานข้อมูล
                globalModel.records.push({
                    image_path: fullImagePath,
                    timestamp: inputTime,
                    weather_status: weatherInfo.status,
                    conditions_desc: weatherInfo.conditions_text,
                    label: weatherInfo.label,
                    env_cloudcover: weatherInfo.cloudcover,
                    env_visibility: weatherInfo.visibility,
                    env_humidity: weatherInfo.humidity,
                    env_precip: weatherInfo.precip,
                    env_solarradiation: weatherInfo.solarradiation,
                    R_mean: color.R_mean,
                    G_mean: color.G_mean,
                    B_mean: color.B_mean,
                    H_mean: color.H_mean,
                    S_mean: color.S_mean,
                    V_mean: color.V_mean
                });

                globalModel.pendingUploads.push({
                    fileData: file,
                    uploadPath: fullImagePath
                });
            }
            
            document.getElementById('loading').style.display = 'none';
            document.getElementById('accText').innerText = `✅ ดึงข้อมูลสำเร็จ! (วิเคราะห์ไป ${files.length} ภาพ)`;
            document.getElementById('resultSection').style.display = 'block';

        } catch (error) {
            document.getElementById('loading').style.display = 'none';
            alert(`เกิดข้อผิดพลาด: ${error.message}`);
        }
    });

    document.getElementById('saveModelBtn').addEventListener('click', async function() {
        const owner = document.getElementById('ghOwner').value;
        const repo = document.getElementById('ghRepo').value;
        const path = document.getElementById('ghPath').value; 
        const token = document.getElementById('ghToken').value;

        if(!owner || !repo || !token) return alert("กรุณากรอกข้อมูล GitHub ให้ครบ (รวมถึง Token)");
        if(globalModel.pendingUploads.length === 0) return alert("ไม่มีข้อมูลให้บันทึก");

        document.getElementById('loading').style.display = 'block';
        
        try {
            const totalFiles = globalModel.pendingUploads.length;
            for (let i = 0; i < totalFiles; i++) {
                document.getElementById('loadingText').innerText = `กำลังอัปโหลดรูปภาพที่ ${i+1} / ${totalFiles}...`;
                const uploadItem = globalModel.pendingUploads[i];
                const base64Data = await fileToBase64(uploadItem.fileData);
                
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${uploadItem.uploadPath}`;
                await fetch(url, {
                    method: "PUT",
                    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ message: `Upload image via ML Web UI`, content: base64Data })
                });
            }

            document.getElementById('loadingText').innerText = "กำลังอัปเดตไฟล์ฐานข้อมูลโมเดล (JSON)...";
            const dbUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
            const headers = { "Authorization": `token ${token}`, "Content-Type": "application/json" };
            
            let sha = null;
            let existingData = [];

            try {
                const getRes = await fetch(dbUrl, { headers });
                if (getRes.ok) {
                    const getJson = await getRes.json();
                    sha = getJson.sha; 
                    const decoded = decodeURIComponent(escape(atob(getJson.content)));
                    existingData = JSON.parse(decoded);
                }
            } catch (e) { console.log("Creating new DB file"); }

            const combinedData = [...existingData, ...globalModel.records];
            const jsonString = JSON.stringify(combinedData, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

            const putBody = { message: `Update ML DB (Total: ${combinedData.length} records)`, content: base64Content };
            if (sha) putBody.sha = sha; 

            const putRes = await fetch(dbUrl, { method: "PUT", headers, body: JSON.stringify(putBody) });

            if(putRes.ok) {
                alert(`☁️ อัปโหลดเสร็จสมบูรณ์!\nอัปโหลดรูปภาพ ${totalFiles} ไฟล์ และอัปเดตฐานข้อมูลสำเร็จ`);
                
                document.getElementById('trainForm').reset();
                document.getElementById('fileListContainer').innerHTML = '';
                document.getElementById('dateTimeInputSection').style.display = 'none';
                document.getElementById('resultSection').style.display = 'none';
            } else {
                alert("❌ เกิดข้อผิดพลาดในการอัปเดตฐานข้อมูล");
            }
        } catch(e) { 
            alert("❌ Error: " + e.message); 
        }
        
        document.getElementById('loading').style.display = 'none';
    });
});
