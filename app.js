// ==========================================
// 1. Machine Learning Class (KNN & GitHub Merge)
// ==========================================
class SimpleKNN {
    constructor() { 
        this.data = []; 
    }
    
    // นำข้อมูลใหม่ไปต่อท้าย (Train Action)
    appendFit(X, y) { 
        const newData = X.map((features, i) => ({ features, label: y[i] }));
        this.data = [...this.data, ...newData]; 
    }

    // ฟังก์ชันคุยกับ GitHub API แบบ Merge (อัปเดตไฟล์)
    async saveAndUpdateGitHub(owner, repo, path, token) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const headers = {
            "Authorization": `token ${token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        };

        let sha = null;
        let existingData = [];

        try {
            const getRes = await fetch(url, { headers });
            if (getRes.ok) {
                const getJson = await getRes.json();
                sha = getJson.sha; 
                const decoded = decodeURIComponent(escape(atob(getJson.content)));
                existingData = JSON.parse(decoded);
            }
        } catch (e) { 
            console.log("No existing file found. Will create a new one."); 
        }

        // นำข้อมูลเก่า + ข้อมูลใหม่ มารวมกัน
        let combined = [...existingData, ...this.data];
        
        // กรองข้อมูลซ้ำซ้อน (Deduplication)
        let uniqueData = [];
        let seen = new Set();
        for (let item of combined) {
            let key = `${item.features.join('_')}_${item.label}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueData.push(item);
            }
        }
        
        this.data = uniqueData;

        // แปลงข้อมูลและ Push กลับขึ้น GitHub
        const jsonString = JSON.stringify(this.data);
        const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

        const body = {
            message: `Update ML Model (Total features: ${this.data.length})`,
            content: base64Content
        };
        if (sha) body.sha = sha; 

        const putRes = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
        return { success: putRes.ok, totalCount: this.data.length };
    }
}

const globalModel = new SimpleKNN();

// ==========================================
// 2. Image Processing & Helper Functions
// ==========================================
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

    // Action 2: เมื่อกดปุ่ม Train (เริ่มสกัดสี)
    document.getElementById('trainForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const files = document.getElementById('images').files;
        const inputs = document.querySelectorAll('.datetime-input');
        
        document.getElementById('loadingText').innerText = "กำลังสกัดค่าสีและเรียนรู้ภาพใหม่...";
        document.getElementById('loading').style.display = 'block';
        document.getElementById('resultSection').style.display = 'none';

        let X = [], y = [];
        for (let i = 0; i < files.length; i++) {
            const color = await extractColors(files[i]);
            X.push([color.rMean, color.gMean, color.bMean]);
            y.push(getMockWeather(new Date(inputs[i].value).getHours()));
        }

        // Action: เอาข้อมูลไป Train โมเดล
        globalModel.appendFit(X, y);
        
        document.getElementById('loading').style.display = 'none';
        document.getElementById('accText').innerText = `✅ ประมวลผลเสร็จสิ้น! (เตรียมพร้อม ${files.length} ภาพ)`;
        document.getElementById('resultSection').style.display = 'block';
    });

    // Action 3: เมื่อกดเซฟและอัปเดตโมเดลขึ้น GitHub
    document.getElementById('saveModelBtn').addEventListener('click', async function() {
        const owner = document.getElementById('ghOwner').value;
        const repo = document.getElementById('ghRepo').value;
        const path = document.getElementById('ghPath').value;
        const token = document.getElementById('ghToken').value;

        if(!owner || !repo || !token) return alert("กรุณากรอกข้อมูล GitHub ให้ครบ (รวมถึง Token)");
        
        document.getElementById('loadingText').innerText = "กำลังดึงข้อมูลเดิมมาผสาน และอัปเดตไฟล์ขึ้น GitHub...";
        document.getElementById('loading').style.display = 'block';
        
        try {
            const result = await globalModel.saveAndUpdateGitHub(owner, repo, path, token);
            if(result.success) {
                alert(`☁️ อัปเดตไฟล์โมเดลขึ้น GitHub สำเร็จ!\n(ตอนนี้ฐานข้อมูลมีข้อมูลทั้งหมด ${result.totalCount} ชุด)`);
                document.getElementById('accText').innerText = `☁️ อัปเดตขึ้น GitHub แล้ว (รวมทั้งหมด ${result.totalCount} ชุด)`;
                
                // ล้างข้อมูลชั่วคราวทิ้งหลังอัปเดตเสร็จ ป้องกันการอัปเดตซ้ำ
                globalModel.data = [];
            }
            else alert("❌ เกิดข้อผิดพลาด ตรวจสอบ Token, ชื่อ User หรือ Repo อีกครั้ง");
        } catch(e) { 
            alert("❌ Error: " + e.message); 
        }
        
        document.getElementById('loading').style.display = 'none';
    });

});
