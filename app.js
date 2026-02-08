import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const firebaseConfig = {
    apiKey: "AIzaSyD7WspCtCQ_pqlUUFbdlIdFa2OgU7yX73A",
    authDomain: "studio-715840410-f5be3.firebaseapp.com",
    projectId: "studio-715840410-f5be3",
    storageBucket: "studio-715840410-f5be3.firebasestorage.app",
    messagingSenderId: "358029699297",
    appId: "1:358029699297:web:6187a14904465990f4efa0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Get current user from localStorage (set on index.html)
const currentUser = localStorage.getItem('currentUser');
if (!currentUser) {
    window.location.href = 'index.html';
}

// Show current user name in header
const userNameEl = document.getElementById('current-user-name');
if (userNameEl) {
    userNameEl.textContent = currentUser.toUpperCase();
}

// Switch user button
const switchUserBtn = document.getElementById('switch-user-btn');
if (switchUserBtn) {
    switchUserBtn.addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    });
}

// Initialize the right page
const path = window.location.pathname;
if (path.includes('dashboard.html')) {
    loadDashboard();
} else if (path.includes('upload.html')) {
    initializeUpload();
} else if (path.includes('insights.html')) {
    loadInsights();
}

// ==================== DASHBOARD ====================

async function loadDashboard() {
    const loading = document.getElementById('loading');
    const content = document.getElementById('dashboard-content');

    try {
        const receiptsQuery = query(
            collection(db, 'receipts'),
            where('userId', '==', currentUser),
            orderBy('createdAt', 'desc')
        );

        onSnapshot(receiptsQuery, (snapshot) => {
            const receipts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            const totalReceipts = receipts.length;
            const totalSpent = receipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            const taxEligible = receipts.filter(r => r.taxEligible);
            const taxEligibleAmount = taxEligible.reduce((sum, r) => sum + (r.amount || 0), 0);

            document.getElementById('total-receipts').textContent = totalReceipts;
            document.getElementById('total-spent').textContent = `RM ${totalSpent.toFixed(2)}`;
            document.getElementById('tax-eligible').textContent = `RM ${taxEligibleAmount.toFixed(2)}`;

            const percentage = totalSpent > 0 ? ((taxEligibleAmount / totalSpent) * 100).toFixed(1) : 0;
            document.getElementById('tax-percentage').textContent = `${percentage}% of total`;

            renderReceiptGallery(receipts);
        }, (error) => {
            console.error('Error listening to receipts:', error);
            loading.innerHTML = '<p>Error loading receipts. Please refresh.</p>';
        });

        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (error) {
        console.error('Error loading dashboard:', error);
        loading.innerHTML = '<p>Error loading dashboard</p>';
    }
}

function renderReceiptGallery(receipts) {
    const galleryContainer = document.getElementById('receipt-gallery');
    if (!galleryContainer) return;

    if (receipts.length === 0) {
        galleryContainer.innerHTML = `
            <div style="text-align: center; color: #6b7280; padding: 2rem; grid-column: 1 / -1;">
                <p style="font-size: 3rem; margin-bottom: 0.5rem;">📸</p>
                <p>No receipts uploaded yet</p>
                <a href="upload.html" style="color: #4F46E5; text-decoration: underline; margin-top: 0.5rem; display: inline-block;">Upload your first receipt</a>
            </div>
        `;
        return;
    }

    galleryContainer.innerHTML = receipts.map(receipt => {
        const dateStr = receipt.date || formatTimestamp(receipt.createdAt);
        const statusLabel = receipt.processedAt ? 'Processed' : 'Uploaded';
        const statusClass = receipt.processedAt ? 'status-complete' : 'status-processing';

        return `
            <div class="receipt-card" onclick="window.openReceiptModal('${receipt.downloadURL || ''}', '${escapeHtml(receipt.merchant || receipt.fileName || 'Receipt')}')">
                <div class="receipt-thumb">
                    ${receipt.downloadURL
                        ? `<img src="${receipt.downloadURL}" alt="Receipt" loading="lazy">`
                        : `<div class="receipt-placeholder">📄</div>`
                    }
                </div>
                <div class="receipt-details">
                    <div class="receipt-merchant">${escapeHtml(receipt.merchant || receipt.fileName || 'Receipt')}</div>
                    <div class="receipt-amount">${receipt.amount ? `RM ${receipt.amount.toFixed(2)}` : '--'}</div>
                    <div class="receipt-date">${dateStr}</div>
                    ${receipt.predictedCategory ? `<span class="receipt-category">${escapeHtml(receipt.predictedCategory)}</span>` : ''}
                    <span class="upload-status ${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Image modal viewer
window.openReceiptModal = function(imageUrl, title) {
    if (!imageUrl) return;

    let modal = document.getElementById('receipt-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'receipt-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="document.getElementById('receipt-modal').style.display='none'">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3 id="modal-title"></h3>
                        <button class="modal-close" onclick="document.getElementById('receipt-modal').style.display='none'">&times;</button>
                    </div>
                    <div class="modal-body">
                        <img id="modal-image" src="" alt="Receipt" style="max-width: 100%; border-radius: 8px;">
                    </div>
                </div>
            </div>
        `;
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;';

        const style = document.createElement('style');
        style.textContent = `
            .modal-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem; }
            .modal-content { background:white;border-radius:12px;max-width:600px;width:100%;max-height:90vh;overflow:auto; }
            .modal-header { display:flex;justify-content:space-between;align-items:center;padding:1rem 1.5rem;border-bottom:1px solid #e5e7eb; }
            .modal-header h3 { margin:0;font-size:1.1rem;color:#1f2937; }
            .modal-close { background:none;border:none;font-size:1.5rem;cursor:pointer;color:#6b7280;padding:0.25rem; }
            .modal-body { padding:1rem; }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);
    }

    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-image').src = imageUrl;
    modal.style.display = 'block';
};

// ==================== UPLOAD ====================

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
                previewImage.style.display = 'block';
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewImage.style.display = 'none';
            previewContainer.style.display = 'block';
            previewContainer.querySelector('.file-name-display')?.remove();
            const fileNameEl = document.createElement('p');
            fileNameEl.className = 'file-name-display';
            fileNameEl.textContent = file.name;
            fileNameEl.style.cssText = 'text-align:center;color:#4b5563;padding:1rem;font-weight:600;';
            previewContainer.insertBefore(fileNameEl, previewContainer.firstChild);
        }
    }

    async function uploadReceipts() {
        const progressBar = document.getElementById('progress-bar');
        const progressFill = document.getElementById('progress-fill');
        const successMessage = document.getElementById('success-message');
        const errorMessage = document.getElementById('error-message');

        if (selectedFiles.length === 0) {
            errorMessage.textContent = 'Please select a file first.';
            errorMessage.style.display = 'block';
            return;
        }

        uploadBtn.disabled = true;
        progressBar.style.display = 'block';
        successMessage.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                const progress = ((i + 0.5) / selectedFiles.length) * 100;
                progressFill.style.width = `${progress}%`;

                const receiptId = `${Date.now()}_${i}`;
                const storagePath = `receipts/${currentUser}/${receiptId}`;
                const storageRef = ref(storage, storagePath);

                await uploadBytes(storageRef, file, {
                    contentType: file.type
                });
                const downloadURL = await getDownloadURL(storageRef);

                await addDoc(collection(db, 'receipts'), {
                    userId: currentUser,
                    storageUrl: `gs://${firebaseConfig.storageBucket}/${storagePath}`,
                    downloadURL: downloadURL,
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    source: 'manual_upload',
                    createdAt: serverTimestamp(),
                    taxEligible: false,
                    amount: 0
                });

                progressFill.style.width = `${((i + 1) / selectedFiles.length) * 100}%`;
            }

            successMessage.style.display = 'block';
            setTimeout(() => {
                previewContainer.style.display = 'none';
                successMessage.style.display = 'none';
                selectedFiles = [];
                fileInput.value = '';
            }, 2500);

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
            where('userId', '==', currentUser),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        onSnapshot(receiptsQuery, (snapshot) => {
            if (snapshot.empty) {
                recentList.innerHTML = '<li style="text-align: center; color: #6b7280; padding: 2rem;">No uploads yet</li>';
                return;
            }

            recentList.innerHTML = snapshot.docs.map(d => {
                const data = d.data();
                const status = data.processedAt ? 'complete' : 'processing';
                const dateStr = formatTimestamp(data.createdAt);

                return `
                    <li class="upload-item" ${data.downloadURL ? `onclick="window.openReceiptModal('${data.downloadURL}', '${escapeHtml(data.merchant || data.fileName || 'Receipt')}')" style="cursor:pointer;"` : ''}>
                        <div class="upload-thumb">
                            ${data.downloadURL && data.fileType?.startsWith('image/')
                                ? `<img src="${data.downloadURL}" alt="Receipt" style="width:48px;height:48px;object-fit:cover;border-radius:6px;">`
                                : `<div class="upload-icon-small">📄</div>`
                            }
                        </div>
                        <div class="upload-info">
                            <div class="upload-name">${escapeHtml(data.merchant || data.fileName || 'Receipt')}</div>
                            <div class="upload-meta">
                                ${data.amount ? `RM ${data.amount.toFixed(2)}` : ''}
                                ${dateStr}
                                ${data.predictedCategory ? `- ${data.predictedCategory}` : ''}
                            </div>
                        </div>
                        <span class="upload-status status-${status}">
                            ${status === 'complete' ? 'Done' : 'Uploaded'}
                        </span>
                    </li>
                `;
            }).join('');
        }, (error) => {
            console.error('Error loading recent uploads:', error);
            recentList.innerHTML = '<li style="text-align: center; color: #ef4444; padding: 1rem;">Error loading uploads</li>';
        });
    } catch (error) {
        console.error('Error loading recent uploads:', error);
    }
}

// ==================== INSIGHTS ====================

async function loadInsights() {
    const categoryGrid = document.getElementById('category-grid');
    const trendsList = document.getElementById('trends-list');
    const recommendationsList = document.getElementById('recommendations-list');

    try {
        const year = new Date().getFullYear();
        const summaryDoc = await getDoc(doc(db, 'tax_summary', `${currentUser}_${year}`));

        if (summaryDoc.exists()) {
            const data = summaryDoc.data();
            renderCategoryBreakdown(data, categoryGrid);
        } else {
            categoryGrid.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 1rem;">No tax data yet. Upload receipts to see category breakdown.</p>';
        }

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const insightsDoc = await getDoc(doc(db, 'monthly_insights', `${currentUser}_${monthKey}`));

        if (insightsDoc.exists()) {
            const data = insightsDoc.data();
            renderTrends(data, trendsList);
            renderRecommendations(data, recommendationsList);
        } else {
            trendsList.innerHTML = '<li class="trend-item">Upload more receipts to see trends</li>';
            recommendationsList.innerHTML = '<li class="recommendation-item">Upload more receipts to get recommendations</li>';
        }

    } catch (error) {
        console.error('Error loading insights:', error);
    }

    const exportCsvBtn = document.getElementById('export-csv');
    const exportExcelBtn = document.getElementById('export-excel');
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', () => exportData('csv'));
    if (exportExcelBtn) exportExcelBtn.addEventListener('click', () => exportData('excel'));
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

    container.innerHTML = Object.keys(TAX_LIMITS).map(category => {
        const total = categories[category] || 0;
        const categoryLimit = TAX_LIMITS[category];
        const percentage = categoryLimit > 0 ? Math.min((total / categoryLimit) * 100, 100) : 0;

        return `
            <div class="category-card">
                <div class="category-name">${category}</div>
                <div class="category-amount">RM ${total.toFixed(2)}</div>
                <div class="category-limit">Limit: RM ${categoryLimit}</div>
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
    alert('Export requires Cloud Functions to be deployed. Upload receipts first!');
}
