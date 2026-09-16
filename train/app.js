// ==========================================
// 1. DATA INGESTION & PREPROCESSING (OpenWeatherMap API)
// ==========================================
const API_KEY = "bd5e378503939ddaee76f12ad7a97608";
const LAT = 13.29; // พิกัดละติจูด หาดบางแสน
const LON = 100.91; // พิกัดลองจิจูด หาดบางแสน

async function fetchHistoricalWeather(datetimeStr) {
    try {
        const dateObj = new Date(datetimeStr);
        const unixTime = Math.floor(dateObj.getTime() / 1000);

        const url = `https://api.openweathermap.org/data/3.0/onecall/timemachine?lat=${LAT}&lon=${LON}&dt=${unixTime}&appid=${API_KEY}&units=metric`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("ไม่สามารถเชื่อมต่อ OpenWeatherMap API ได้");
        
        const json = await response.json();
        const data = json.data[0]; 
        
        const cloudcover = data.clouds || 0; 
        const visibility = (data.visibility || 0) / 1000; 
        const humidity = data.humidity || 0;
        
        let precip = 0;
        if (data.rain && data.rain['1h']) {
            precip = data.rain['1h'];
        }

        const conditionsMain = data.weather && data.weather.length > 0 ? data.weather[0].main : "Unknown";
        const conditionsDesc = data.weather && data.weather.length > 0 ? data.weather[0].description : "Unknown";

        let status = "Clear";
        let label = 1;
        let icon = "☀️";
        
        if (precip > 0 || conditionsMain === "Rain" || conditionsMain === "Thunderstorm") {
            status = "Gloomy";
            label = 0;
            icon = "🌧️";
        } else if (cloudcover > 70 && conditionsMain === "Clouds") {
            status = "Gloomy";
            label = 0;
            icon = "☁️";
        } else {
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
            solarradiation: 0, 
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
    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); 
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสี และดึงข้อมูลจาก OpenWeatherMap API...";
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
                
                const [color, weatherInfo] = await Promise.all([
                    extractSkyColors(file),
                    fetchHistoricalWeather(inputTime)
                ]);
                
                const uniqueFilename = `${Date.now()}_${file.name}`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`; 

                const badgeClass = weatherInfo.label === 1 ? "bg-warning text-dark" : "bg-secondary";
                const badgeText = weatherInfo.label === 1 ? "กลุ่ม 1 (ฟ้าโปร่ง)" : "กลุ่ม 0 (ฟ้าหม่น)";

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${color.previewUrl}" class="thumbnail-img"></td>
                    <td>
                        <div class="fw-bold text-muted" style="font-size: 0.85em;">${inputTime.replace('T', ' ')}</div>
                        <div class="fw-bold mt-1">${weatherInfo.status} ${weatherInfo.icon}</div>
                        <div style="font-size: 0.8em; color: #666;">
                            เมฆ: ${weatherInfo.cloudcover}% | ชื้น: ${weatherInfo.humidity}%<br>
                            ทัศนวิสัย: ${weatherInfo.visibility}km
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
