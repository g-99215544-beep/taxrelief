import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

let currentUser = null;

onAuthStateChanged(auth, (user) => {
    if (!user && window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
        window.location.href = '/index.html';
        return;
    }
    
    currentUser = user;
    
    if (user) {
        initializePage();
    }
});

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
        window.location.href = '/index.html';
    });
}

function initializePage() {
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        loadDashboard();
    } else if (path.includes('upload.html')) {
        initializeUpload();
    } else if (path.includes('insights.html')) {
        loadInsights();
    }
}

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const content = document.getElementById('dashboard-content');
    
    try {
        const year = new Date().getFullYear();
        
        const receiptsQuery = query(
            collection(db, 'receipts'),
            where('userId', '==', currentUser.uid),
            where('date', '>=', `${year}-01-01`),
            where('date', '<=', `${year}-12-31`)
        );
        
        onSnapshot(receiptsQuery, (snapshot) => {
            const receipts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            const totalReceipts = receipts.length;
            const totalSpent = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            const taxEligible = receipts.filter(r => r.taxEligible);
            const taxEligibleAmount = taxEligible.reduce((sum, r) => sum + (r.amount || 0), 0);
            
            document.getElementById('total-receipts').textContent = totalReceipts;
            document.getElementById('total-spent').textContent = `RM ${totalSpent.toFixed(2)}`;
            document.getElementById('tax-eligible').textContent = `RM ${taxEligibleAmount.toFixed(2)}`;
            
            const percentage = totalSpent > 0 ? ((taxEligibleAmount / totalSpent) * 100).toFixed(1) : 0;
            document.getElementById('tax-percentage').textContent = `${percentage}% of total`;
            
            loadTaxSummary(year);
            loadMonthlyInsights();
        });
        
        loading.style.display = 'none';
        content.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        loading.innerHTML = '<p>Error loading dashboard</p>';
    }
}

async function loadTaxSummary(year) {
    try {
        const summaryDoc = await getDoc(doc(db, 'tax_summary', `${currentUser.uid}_${year}`));
        
        if (summaryDoc.exists()) {
            const data = summaryDoc.data();
            const totalClaimable = data.totalClaimable || 0;
            document.getElementById('total-claimable').textContent = `RM ${totalClaimable.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Error loading tax summary:', error);
    }
}

async function loadMonthlyInsights() {
    try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        const insightsDoc = await getDoc(doc(db, 'monthly_insights', `${currentUser.uid}_${monthKey}`));
        
        if (insightsDoc.exists()) {
            const data = insightsDoc.data();
            renderInsights(data);
            renderAlerts(data);
        }
    } catch (error) {
        console.error('Error loading insights:', error);
    }
}

function renderInsights(data) {
    const insightsList = document.getElementById('insights-list');
    
    if (!data.recommendations || data.recommendations.length === 0) {
        return;
    }
    
    insightsList.innerHTML = data.recommendations.map(rec => `
        <li class="insight-item">
            <div class="insight-title">${rec.type.replace(/_/g, ' ')}</div>
            <div class="insight-text">${rec.message}</div>
        </li>
    `).join('');
}

function renderAlerts(data) {
    const alertsList = document.getElementById('alerts-list');
    
    if (!data.alerts || data.alerts.length === 0) {
        return;
    }
    
    alertsList.innerHTML = data.alerts.map(alert => `
        <li class="alert-item alert-${alert.severity.toLowerCase()}">
            ${alert.message}
        </li>
    `).join('');
}

function initializeUpload() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const cameraBtn = document.getElementById('camera-btn');
    
    let selectedFiles = [];
    
    uploadZone.addEventListener('click', () => fileInput.click());
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        selectedFiles = Array.from(e.dataTransfer.files);
        handleFileSelection();
    });
    
    fileInput.addEventListener('change', (e) => {
        selectedFiles = Array.from(e.target.files);
        handleFileSelection();
    });
    
    cameraBtn.addEventListener('click', () => {
        fileInput.setAttribute('capture', 'environment');
        fileInput.click();
    });
    
    uploadBtn.addEventListener('click', () => uploadReceipts());
    
    function handleFileSelection() {
        if (selectedFiles.length === 0) return;
        
        const file = selectedFiles[0];
        
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewImage.style.display = 'none';
            previewContainer.style.display = 'block';
        }
    }
    
    async function uploadReceipts() {
        const progressBar = document.getElementById('progress-bar');
        const progressFill = document.getElementById('progress-fill');
        const successMessage = document.getElementById('success-message');
        const errorMessage = document.getElementById('error-message');
        
        uploadBtn.disabled = true;
        progressBar.style.display = 'block';
        successMessage.style.display = 'none';
        errorMessage.style.display = 'none';
        
        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const progress = ((i + 1) / selectedFiles.length) * 100;
                progressFill.style.width = `${progress}%`;
                
                const receiptId = `${Date.now()}_${i}`;
                const storagePath = `receipts/${currentUser.uid}/${receiptId}`;
                const storageRef = ref(storage, storagePath);
                
                await uploadBytes(storageRef, file);
                const downloadURL = await getDownloadURL(storageRef);
                
                await addDoc(collection(db, 'receipts'), {
                    userId: currentUser.uid,
                    storageUrl: `gs://${storage.app.options.storageBucket}/${storagePath}`,
                    downloadURL: downloadURL,
                    source: 'manual_upload',
                    createdAt: serverTimestamp(),
                    taxEligible: false,
                    amount: 0
                });
            }
            
            successMessage.style.display = 'block';
            setTimeout(() => {
                previewContainer.style.display = 'none';
                selectedFiles = [];
                fileInput.value = '';
                loadRecentUploads();
            }, 2000);
            
        } catch (error) {
            console.error('Upload error:', error);
            errorMessage.textContent = 'Upload failed: ' + error.message;
            errorMessage.style.display = 'block';
        } finally {
            uploadBtn.disabled = false;
            progressBar.style.display = 'none';
            progressFill.style.width = '0%';
        }
    }
    
    loadRecentUploads();
}

async function loadRecentUploads() {
    const recentList = document.getElementById('recent-uploads');
    
    try {
        const receiptsQuery = query(
            collection(db, 'receipts'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
        );
        
        onSnapshot(receiptsQuery, (snapshot) => {
            if (snapshot.empty) {
                recentList.innerHTML = '<li style="text-align: center; color: #6b7280; padding: 2rem;">No uploads yet</li>';
                return;
            }
            
            recentList.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                const status = data.processedAt ? 'complete' : 'processing';
                
                return `
                    <li class="upload-item">
                        <div class="upload-icon-small">📄</div>
                        <div class="upload-info">
                            <div class="upload-name">${data.merchant || 'Processing...'}</div>
                            <div class="upload-meta">
                                ${data.amount ? `RM ${data.amount.toFixed(2)}` : ''} 
                                ${data.date || ''}
                                ${data.predictedCategory || ''}
                            </div>
                        </div>
                        <span class="upload-status status-${status}">
                            ${status === 'complete' ? '✓ Done' : '⏳ Processing'}
                        </span>
                    </li>
                `;
            }).join('');
        });
    } catch (error) {
        console.error('Error loading recent uploads:', error);
    }
}

async function loadInsights() {
    const categoryGrid = document.getElementById('category-grid');
    const trendsList = document.getElementById('trends-list');
    const recommendationsList = document.getElementById('recommendations-list');
    
    try {
        const year = new Date().getFullYear();
        const summaryDoc = await getDoc(doc(db, 'tax_summary', `${currentUser.uid}_${year}`));
        
        if (summaryDoc.exists()) {
            const data = summaryDoc.data();
            renderCategoryBreakdown(data, categoryGrid);
        }
        
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const insightsDoc = await getDoc(doc(db, 'monthly_insights', `${currentUser.uid}_${monthKey}`));
        
        if (insightsDoc.exists()) {
            const data = insightsDoc.data();
            renderTrends(data, trendsList);
            renderRecommendations(data, recommendationsList);
        }
        
    } catch (error) {
        console.error('Error loading insights:', error);
    }
    
    document.getElementById('export-csv').addEventListener('click', () => exportData('csv'));
    document.getElementById('export-excel').addEventListener('click', () => exportData('excel'));
}

const TAX_LIMITS = {
    'Medical': 8000,
    'Education': 7000,
    'Lifestyle': 2500,
    'Books': 2500,
    'Sports': 500,
    'Gadget': 2500,
    'Internet': 2500,
    'Parenting': 2000,
    'Insurance': 3000,
    'PRS': 3000
};

function renderCategoryBreakdown(data, container) {
    const categories = data.categoryTotals || {};
    const claimable = data.claimableAmounts || {};
    
    container.innerHTML = Object.keys(TAX_LIMITS).map(category => {
        const total = categories[category] || 0;
        const limit = TAX_LIMITS[category];
        const percentage = limit > 0 ? Math.min((total / limit) * 100, 100) : 0;
        
        return `
            <div class="category-card">
                <div class="category-name">${category}</div>
                <div class="category-amount">RM ${total.toFixed(2)}</div>
                <div class="category-limit">Limit: RM ${limit}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderTrends(data, container) {
    if (!data.trends || data.trends.length === 0) {
        container.innerHTML = '<li class="trend-item">No trends available yet</li>';
        return;
    }
    
    container.innerHTML = data.trends.map(trend => `
        <li class="trend-item">
            <span class="trend-badge trend-${trend.direction?.toLowerCase() || 'increase'}">
                ${trend.percentage}%
            </span>
            ${trend.message}
        </li>
    `).join('');
}

function renderRecommendations(data, container) {
    if (!data.recommendations || data.recommendations.length === 0) {
        container.innerHTML = '<li class="recommendation-item">No recommendations at this time</li>';
        return;
    }
    
    container.innerHTML = data.recommendations.map(rec => `
        <li class="recommendation-item">
            <div class="recommendation-title">${rec.type.replace(/_/g, ' ')}</div>
            <div class="recommendation-text">${rec.message}</div>
        </li>
    `).join('');
}

async function exportData(format) {
    try {
        const year = new Date().getFullYear();
        const exportReceipts = httpsCallable(functions, 'exportReceipts');
        
        const result = await exportReceipts({ format, year });
        
        const blob = base64ToBlob(result.data.data, result.data.contentType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipts_${year}.${format === 'csv' ? 'csv' : 'xlsx'}`;
        a.click();
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Export failed: ' + error.message);
    }
}

function base64ToBlob(base64, contentType) {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
    }
    
    return new Blob(byteArrays, { type: contentType });
}

export { auth, db, storage, functions };
