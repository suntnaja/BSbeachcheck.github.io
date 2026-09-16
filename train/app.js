// ==========================================
// 1. DATA INGESTION & PREPROCESSING
// ==========================================
function getHistoricalWeather(timestamp) {
    let hour = 12;
    if (timestamp) {
        hour = new Date(timestamp).getHours();
    }
    if (hour >= 15 || hour < 6) {
        return { weather_status: "Gloomy", label: 0 };
    } else {
        return { weather_status: "Clear", label: 1 };
    }
}

// ==========================================
// 2. FEATURES (สกัดข้อมูลสีท้องฟ้า)
// ==========================================
function extractSkyColors(file) {
    return new Promise((resolve, reject) => { // ✅ เพิ่ม reject สำหรับกรณีเกิด Error
        const img = new Image();
        
        // ✅ เปลี่ยนมาใช้ URL.createObjectURL เร็วและประหยัดแรมกว่า FileReader มหาศาล
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

                resolve({
                    R_mean: parseFloat(rMean.toFixed(2)),
                    G_mean: parseFloat(gMean.toFixed(2)),
                    B_mean: parseFloat(bMean.toFixed(2)),
                    previewUrl: objectUrl // ส่ง URL ชั่วคราวไปแสดงภาพพรีวิว
                });
            } catch (err) {
                reject(err);
            }
        };

        // ✅ ดักจับ Error ถ้าเบราว์เซอร์อ่านภาพไม่ได้ (ป้องกันระบบค้าง)
        img.onerror = function() {
            reject(new Error(`ไม่สามารถอ่านไฟล์ภาพ ${file.name} ได้ (อาจเป็นไฟล์ที่ไม่รองรับ)`));
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
        } else { 
            section.style.display = 'none'; 
        }
    });

    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); 
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสีและสร้างตารางผลลัพธ์...";
        document.getElementById('loading').style.display = 'block';
        document.getElementById('resultSection').style.display = 'none';

        globalModel.records = [];
        globalModel.pendingUploads = [];

        const tbody = document.getElementById('resultTableBody');
        tbody.innerHTML = ''; 

        // ✅ ห่อหุ้มการทำงานด้วย try...catch เพื่อป้องกันระบบค้างหากมีภาพพัง
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const color = await extractSkyColors(file);
                const inputTime = inputs[i].value; 
                const weatherInfo = getHistoricalWeather(inputTime);
                
                const uniqueFilename = `${Date.now()}_${file.name}`;
                const fullImagePath = `${imgFolder}/${uniqueFilename}`; 

                const weatherIcon = weatherInfo.label === 1 ? "☀️" : "☁️";
                const badgeClass = weatherInfo.label === 1 ? "bg-warning text-dark" : "bg-secondary";
                const badgeText = weatherInfo.label === 1 ? "กลุ่ม 1 (ฟ้าโปร่ง)" : "กลุ่ม 0 (ฟ้าหม่น)";

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><img src="${color.previewUrl}" class="thumbnail-img"></td>
                    <td>
                        <div class="fw-bold text-muted" style="font-size: 0.9em;">${inputTime.replace('T', ' ')}</div>
                        <div>${weatherInfo.weather_status} ${weatherIcon}</div>
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
                    weather_status: weatherInfo.weather_status,
                    label: weatherInfo.label,
                    R_mean: color.R_mean,
                    G_mean: color.G_mean,
                    B_mean: color.B_mean
                });

                globalModel.pendingUploads.push({
                    fileData: file,
                    uploadPath: fullImagePath
                });
            }
            
            // เมื่อเสร็จสิ้นทุกลูป ให้แสดงผลลัพธ์
            document.getElementById('loading').style.display = 'none';
            document.getElementById('accText').innerText = `✅ จัดกลุ่มภาพเสร็จสิ้น! (วิเคราะห์ไป ${files.length} ภาพ)`;
            document.getElementById('resultSection').style.display = 'block';

        } catch (error) {
            // ✅ ดักจับ Error และแจ้งผู้ใช้เพื่อไม่ให้โปรแกรมค้าง
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
