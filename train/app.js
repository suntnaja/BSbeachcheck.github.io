// ==========================================
// 1. DATA INGESTION & PREPROCESSING (dmt API)
// ==========================================
const TMD_ACCESS_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6Ijk5MTI2ZGRhNjQ1MzE1ZjFlMmMyYzE2MWNjYzUxMDE3ZTljZjVlODE3MzNlYTA3OGE1YWFjZjE0NDBkNzQ4ZjdkMjU4MzgyZDIwMGY1MDFiIn0.eyJhdWQiOiIyIiwianRpIjoiOTkxMjZkZGE2NDUzMTVmMWUyYzJjMTYxY2NjNTEwMTdlOWNmNWU4MTczM2VhMDc4YTVhYWNmMTQ0MGQ3NDhmN2QyNTgzODJkMjAwZjUwMWIiLCJpYXQiOjE3ODk1ODQ1MjYsIm5iZiI6MTc4OTU4NDUyNiwiZXhwIjoxODIxMTIwNTI2LCJzdWIiOiI1OTI1Iiwic2NvcGVzIjpbXX0.czc-TQccI2L4j5WCjUAHNNWuZN5QLkObEEa5m_fLFzeQpmsu8n6VMVlhpfkMiJ0s-0eT99bhUF0eLeR_YbB921wbx3-rKgDAYRNo1FwmHmWMtLVEupTwVXCcgc8d4Gv2DdiyxtKOiu0YWLyoNx_kbTehUFp0v8zVyd5uauAUfN6_-NX5U2-sTaPiPDii1oq8fTGTcFhUG48jWpvdKWBJnMvXTPKLFCSYHWt7g5OIWpyHKEpUha7iXiqb7ETGxF2KVoJ6nLmajKcdZqOUyAigYDuoK21kKdzIIqSVOpaPhJ6I78pXYMVivSDnYNZprJLV9KvcJbQ6H_rGgPPDM-mrfz0og_tJ6blDoe7QkxpNpBnL_H-mHxzsubDYF3vNBBVcOh8MFT4tJAAAT1wXooqy5NQDSSKPQJMLL4vfpwwQNRGLGjhKhDFLjXI9_M6GfllRyYtyAGizYXhnIS6wSpdHvjwG16kgQ_Fxpc3RfYkfkPv0q6ZLGNiQoKbV3krhmAvq5VWx2FAxFP7mD5jUaB-6elQe_wM60muAQhQkWZAe7K4RKb8sq5d6dZ3qcIhoRvUB1RPsG7O-i-sXDbcSZfwpatF24RrX0rMVCcp0Bcp07rUHUurcGNYYilnCTmu2xhUM_Jfr6vhGgcjVhdhI8Zc3I_Magx0hay1b51K_T75GLJk";
const LAT = 13.29; // พิกัดละติจูด หาดบางแสน
const LON = 100.91; // พิกัดลองจิจูด หาดบางแสน

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

async function fetchHistoricalWeather(datetimeStr) {
    try {
        const dateObj = new Date(datetimeStr);
        const dateStr = dateObj.toISOString().split('T')[0];
        const hour = dateObj.getHours();

        // 🌟 1. ใช้ CORS Proxy เพื่อเป็นสื่อกลางทะลุการบล็อกของเบราว์เซอร์
        const proxy = "https://corsproxy.org/?";

        // URL ต้นฉบับ
        const rawHourlyUrl = `https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/at?lat=${LAT}&lon=${LON}&fields=tc,rh,rain,cloudlow,cloudmed,cloudhigh,cond&date=${dateStr}&hour=${hour}&duration=1`;
        const rawDailyUrl = `https://data.tmd.go.th/nwpapi/v1/forecast/location/daily/at?lat=${LAT}&lon=${LON}&fields=swdown&date=${dateStr}&duration=1`;

        // นำ URL มาเข้ารหัสต่อท้าย Proxy
        const hourlyUrl = proxy + encodeURIComponent(rawHourlyUrl);
        const dailyUrl = proxy + encodeURIComponent(rawDailyUrl);

        const requestOptions = {
            method: "GET",
            headers: {
                "accept": "application/json",
                "authorization": `Bearer ${TMD_ACCESS_TOKEN}`
            }
        };

        const [hourlyRes, dailyRes] = await Promise.all([
            fetch(hourlyUrl, requestOptions),
            fetch(dailyUrl, requestOptions)
        ]);

        // 🌟 2. ดักจับ Error แบบเจาะลึก ถ้าพัง จะแจ้งเหตุผลจากเซิร์ฟเวอร์โดยตรง
        if (!hourlyRes.ok) {
            const errText = await hourlyRes.text();
            throw new Error(`รายชั่วโมงล้มเหลว (Status ${hourlyRes.status}): ${errText}`);
        }
        if (!dailyRes.ok) {
            const errText = await dailyRes.text();
            throw new Error(`รายวันล้มเหลว (Status ${dailyRes.status}): ${errText}`);
        }

        const hourlyData = await hourlyRes.json();
        const dailyData = await dailyRes.json();

        // 🌟 3. ป้องกันบัคกรณีที่กรมอุตุฯ ส่งข้อมูลมาเป็นค่าว่าง (เช่น การใส่วันที่ในอดีต)
        if (!hourlyData.WeatherForecasts || hourlyData.WeatherForecasts.length === 0) {
            throw new Error("กรมอุตุฯ ไม่มีข้อมูลของวันนี้ (โปรดหลีกเลี่ยงการเลือกวันที่ในอดีต)");
        }

        const hData = hourlyData.WeatherForecasts[0].forecasts[0].data;
        const dData = dailyData.WeatherForecasts[0].forecasts[0].data;

        const condCode = hData.cond || 1;
        const weather = weatherConditionMap[condCode] || weatherConditionMap[1];

        return {
            status: weather.text,
            label: weather.label,
            icon: weather.icon,
            tc: hData.tc || 0,
            rh: hData.rh || 0,
            precip: hData.rain || 0,
            cloudlow: hData.cloudlow || 0,
            cloudmed: hData.cloudmed || 0,
            cloudhigh: hData.cloudhigh || 0,
            solarradiation: dData.swdown || 0,
            conditions_text: weather.text
        };
    } catch (err) {
        console.error("TMD API Error:", err);
        // จะนำข้อความ Error ที่แท้จริงไปแสดงผลในตาราง HTML ตรงๆ เลย
        return { 
            status: "Error", label: 1, icon: "❓", 
            tc: 0, rh: 0, precip: 0, cloudlow: 0, cloudmed: 0, cloudhigh: 0, solarradiation: 0, 
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
    
    // ------------------------------------------
    // 4.1 โหลดข้อมูลการตั้งค่า GitHub อัตโนมัติ (Local Storage)
    // ------------------------------------------
    if (localStorage.getItem('ghOwner')) document.getElementById('ghOwner').value = localStorage.getItem('ghOwner');
    if (localStorage.getItem('ghRepo')) document.getElementById('ghRepo').value = localStorage.getItem('ghRepo');
    if (localStorage.getItem('ghPath')) document.getElementById('ghPath').value = localStorage.getItem('ghPath');
    if (localStorage.getItem('ghImageFolder')) document.getElementById('ghImageFolder').value = localStorage.getItem('ghImageFolder');
    if (localStorage.getItem('ghToken')) document.getElementById('ghToken').value = localStorage.getItem('ghToken');

    const inputsToSave = ['ghOwner', 'ghRepo', 'ghPath', 'ghImageFolder', 'ghToken'];
    inputsToSave.forEach(id => {
        document.getElementById(id).addEventListener('input', function(e) {
            localStorage.setItem(id, e.target.value);
        });
    });

    // ------------------------------------------
    // 4.2 ตรวจจับการเลือกไฟล์ภาพ (ที่หายไป)
    // ------------------------------------------
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
        } else { 
            section.style.display = 'none'; 
        }
    });

    // ------------------------------------------
    // 4.3 เมื่อกดปุ่ม Train (สกัดสี + ดึงสภาพอากาศ + วาดตาราง)
    // ------------------------------------------
    // (ในส่วนของ document.getElementById('trainForm').addEventListener('submit', ...) )
   document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault(); // 🛑 โค้ดบรรทัดนี้สำคัญมาก! ทำหน้าที่ป้องกันไม่ให้หน้าเว็บรีเฟรชตัวเอง

        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); 
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสี และดึงข้อมูลจาก TMD NWP API...";
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
                
                // สกัดสี และ ดึง API พร้อมกัน
                const [color, weatherInfo] = await Promise.all([
                    extractSkyColors(file),
                    fetchHistoricalWeather(inputTime)
                ]);
                
                const uniqueFilename = `${Date.now()}_${file.name}`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`; 

                const badgeClass = weatherInfo.label === 1 ? "bg-warning text-dark" : "bg-secondary";
                const badgeText = weatherInfo.label === 1 ? "กลุ่ม 1 (ฟ้าโปร่ง)" : "กลุ่ม 0 (ฟ้าหม่น)";

                // สร้างแถวตาราง
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${color.previewUrl}" class="thumbnail-img"></td>
                    <td>
                        <div class="fw-bold text-muted" style="font-size: 0.85em;">${inputTime.replace('T', ' ')}</div>
                        <div class="fw-bold mt-1 text-primary">${weatherInfo.status} ${weatherInfo.icon}</div>
                        <div style="font-size: 0.8em; color: #555; margin-top: 4px;">
                            🌡️ อุณหภูมิ: ${weatherInfo.tc}°C | 💧 ความชื้น: ${weatherInfo.rh}%<br>
                            🌧️ ปริมาณฝน: ${weatherInfo.precip} mm | ☀️ รังสีคลื่นสั้น: ${weatherInfo.solarradiation}<br>
                            ☁️ เมฆ (ต่ำ/กลาง/สูง): ${weatherInfo.cloudlow}% / ${weatherInfo.cloudmed}% / ${weatherInfo.cloudhigh}%
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

                // อัปเดตข้อมูลที่จะส่งไปเก็บใน model_db.json
                globalModel.records.push({
                    image_path: fullImagePath,
                    timestamp: inputTime,
                    weather_status: weatherInfo.status,
                    label: weatherInfo.label,
                    env_tc: weatherInfo.tc,
                    env_rh: weatherInfo.rh,
                    env_rain: weatherInfo.precip,
                    env_cloudlow: weatherInfo.cloudlow,
                    env_cloudmed: weatherInfo.cloudmed,
                    env_cloudhigh: weatherInfo.cloudhigh,
                    env_swdown: weatherInfo.solarradiation,
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

    // ------------------------------------------
    // 4.4 เมื่อกด Save ขึ้น GitHub
    // ------------------------------------------
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
