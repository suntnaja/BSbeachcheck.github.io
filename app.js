// ==========================================
// 1. Machine Learning Class (KNN & GitHub Merge)
// ==========================================
class SimpleKNN {
    constructor() { 
        this.data = []; 
        this.pendingUploads = []; // เก็บไฟล์รูปที่รอการอัปโหลดขึ้น GitHub
    }
    
    // รับค่าข้อมูลใหม่ พร้อมข้อมูล Metadata (ชื่อไฟล์, ไฟล์รูป)
    appendFit(features, label, metadata) { 
        // บันทึกข้อมูลลงฐานข้อมูลชั่วคราวบนเบราว์เซอร์
        this.data.push({
            filename: metadata.filename,
            image_path: metadata.imagePath,
            timestamp: metadata.dateTime,
            features: features,
            label: label
        });

        // เก็บไฟล์รูปรอไว้ในคิวสำหรับการอัปโหลด
        this.pendingUploads.push({
            fileData: metadata.fileObj,
            uploadPath: metadata.imagePath
        });
    }

    // ฟังก์ชันอัปโหลดรูปภาพขึ้น GitHub แบบ Base64
    async uploadImageToGitHub(owner, repo, path, fileBase64, token) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = {
            "Authorization": `token ${token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        };
        const body = {
            message: `Upload image file: ${path}`,
            content: fileBase64
        };
        const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
        return res.ok;
    }

    // ฟังก์ชันอัปเดตไฟล์ฐานข้อมูล model_db.json
    async updateDatabaseGitHub(owner, repo, path, token) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = {
            "Authorization": `token ${token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        };

        let sha = null;
        let existingData = [];

        // 1. ดึงไฟล์เดิม (ถ้ามี)
        try {
            const getRes = await fetch(url, { headers });
            if (getRes.ok) {
                const getJson = await getRes.json();
                sha = getJson.sha; 
                const decoded = decodeURIComponent(escape(atob(getJson.content)));
                existingData = JSON.parse(decoded);
            }
        } catch (e) { 
            console.log("No existing JSON database found. Creating a new one."); 
        }

        // 2. รวมข้อมูลเก่ากับข้อมูลใหม่
        let combined = [...existingData, ...this.data];
        
        // 3. แปลงข้อมูลและ Push กลับ
        const jsonString = JSON.stringify(combined, null, 2); // จัด Format JSON ให้สวยงามด้วย
        const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

        const body = {
            message: `Update ML DB (Added ${this.data.length} new records. Total: ${combined.length})`,
            content: base64Content
        };
        if (sha) body.sha = sha; 

        const putRes = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
        return { success: putRes.ok, totalCount: combined.length };
    }
}

const globalModel = new SimpleKNN();

// ==========================================
// 2. Image Processing & Helper Functions
// ==========================================

// แปลงไฟล์รูปภาพเป็น Base64 บริสุทธิ์ (ตัด header ออก) สำหรับ GitHub API
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // ตัดส่วน "data:image/jpeg;base64," ด้านหน้าทิ้ง
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

function extractColors(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.getElementById('hiddenCanvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 400; canvas.height = 300;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const skyHeight = Math.floor(canvas.height * 0.3);
                const data = ctx.getImageData(0, 0, canvas.width, skyHeight).data;
                let rSum = 0, gSum = 0, bSum = 0;
                let count = data.length / 4;
                for (let i = 0; i < data.length; i += 4) { 
                    rSum += data[i]; 
                    gSum += data[i+1]; 
                    bSum += data[i+2]; 
                }
                resolve({
                    rMean: parseFloat((rSum/count).toFixed(2)),
                    gMean: parseFloat((gSum/count).toFixed(2)),
                    bMean: parseFloat((bSum/count).toFixed(2))
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function getMockWeather(hour) { 
    return (hour >= 15 || hour < 6) ? 0 : 1; 
}

// ==========================================
// 3. User Interface Actions (Event Listeners)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    
    // Action 1: เมื่อผู้ใช้เลือกไฟล์ภาพ สร้างช่องใส่วันเวลา
    document.getElementById('images').addEventListener('change', function(e) {
        const files = e.target.files;
        const container = document.getElementById('fileListContainer');
        const section = document.getElementById('dateTimeInputSection');
        container.innerHTML = '';
        
        if (files.length > 0) {
            section.style.display = 'block';
            Array.from(files).forEach(file => {
                container.innerHTML += `
                <div class="d-flex align-items-center justify-content-between mb-2 p-3 border rounded bg-white shadow-sm">
                    <span class="fw-bold text-truncate me-2" style="max-width: 50%;">${file.name}</span>
                    <input type="datetime-local" class="form-control datetime-input" style="max-width: 45%;" required>
                </div>`;
            });
        } else { 
            section.style.display = 'none'; 
        }
    });

    // Action 2: เมื่อกดปุ่ม Train (เริ่มสกัดสีและเก็บรูปลงคิว)
    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        const imgFolder = document.getElementById('ghImageFolder').value.replace(/\/$/, ""); // ลบ / ท้ายสุดถ้ามี
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสีและเตรียมข้อมูลภาพ...";
        document.getElementById('loading').style.display = 'block';
        document.getElementById('resultSection').style.display = 'none';

        // วนลูปจัดการแต่ละไฟล์
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const color = await extractColors(file);
            const inputTime = inputs[i].value; // เวลาที่ผู้ใช้กรอก
            const label = getMockWeather(new Date(inputTime).getHours());
            
            // สร้างชื่อไฟล์ใหม่ให้ Unique (เติม Timestamp ด้านหน้า ป้องกันชื่อซ้ำ)
            const uniqueFilename = `${Date.now()}_${file.name}`;
            const fullImagePath = `${imgFolder}/${uniqueFilename}`; // เช่น images/169000123_sky.jpg

            const features = [color.rMean, color.gMean, color.bMean];
            const metadata = {
                filename: uniqueFilename,
                imagePath: fullImagePath,
                dateTime: inputTime,
                fileObj: file // ส่งไฟล์อ็อบเจกต์เต็มไปด้วยเพื่อรออัปโหลด
            };

            // โยนข้อมูลให้ Class จัดการ
            globalModel.appendFit(features, label, metadata);
        }
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('accText').innerText = `✅ สกัดฟีเจอร์เสร็จสิ้น! (พร้อมอัปโหลด ${files.length} ภาพ)`;
        document.getElementById('resultSection').style.display = 'block';
    });

    // Action 3: เมื่อกดเซฟ (อัปโหลดรูป -> อัปเดต JSON DB)
    document.getElementById('saveModelBtn').addEventListener('click', async function() {
        const owner = document.getElementById('ghOwner').value;
        const repo = document.getElementById('ghRepo').value;
        const path = document.getElementById('ghPath').value; // เช่น model_db.json
        const token = document.getElementById('ghToken').value;

        if(!owner || !repo || !token) return alert("กรุณากรอกข้อมูล GitHub ให้ครบ (รวมถึง Token)");
        if(globalModel.pendingUploads.length === 0) return alert("ไม่มีข้อมูลให้บันทึก กรุณาอัปโหลดรูปก่อน");

        document.getElementById('loading').style.display = 'block';
        
        try {
            // 3.1 อัปโหลดรูปภาพขึ้น GitHub ทีละรูป
            const totalFiles = globalModel.pendingUploads.length;
            for (let i = 0; i < totalFiles; i++) {
                document.getElementById('loadingText').innerText = `กำลังอัปโหลดรูปภาพที่ ${i+1} จาก ${totalFiles}...`;
                
                const uploadItem = globalModel.pendingUploads[i];
                const base64Data = await fileToBase64(uploadItem.fileData);
                
                await globalModel.uploadImageToGitHub(
                    owner, repo, uploadItem.uploadPath, base64Data, token
                );
            }

            // 3.2 อัปเดตฐานข้อมูล JSON
            document.getElementById('loadingText').innerText = "รูปภาพอัปโหลดสำเร็จ! กำลังผสานฐานข้อมูล JSON...";
            const result = await globalModel.updateDatabaseGitHub(owner, repo, path, token);
            
            if(result.success) {
                alert(`☁️ เสร็จสิ้นสมบูรณ์!\nอัปโหลดรูปภาพ ${totalFiles} ไฟล์\nและอัปเดตฐานข้อมูล (มีข้อมูลทั้งหมด ${result.totalCount} ชุด)`);
                document.getElementById('accText').innerText = `☁️ อัปเดตสำเร็จ! (ข้อมูลในระบบทั้งหมด ${result.totalCount} ชุด)`;
                
                // ล้างข้อมูลเพื่อป้องกันการกดเบิ้ล
                globalModel.data = [];
                globalModel.pendingUploads = [];
                document.getElementById('trainForm').reset();
                document.getElementById('fileListContainer').innerHTML = '';
                document.getElementById('dateTimeInputSection').style.display = 'none';
                document.getElementById('saveModelBtn').disabled = true; // ป้องกันกดซ้ำ
            }
        } catch(e) { 
            alert("❌ Error: " + e.message); 
        }
        
        document.getElementById('loading').style.display = 'none';
    });

});
