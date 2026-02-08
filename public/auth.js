import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyD7WspCtCQ_pqlUUFbdlIdFa2OgU7yX73A",
    authDomain: "studio-715840410-f5be3.firebaseapp.com",
    projectId: "studio-715840410-f5be3",
    storageBucket: "studio-715840410-f5be3.firebasestorage.app",
    messagingSenderId: "358029699297",
    appId: "1:358029699297:web:6187a14904465990f4efa0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            window.location.href = '/dashboard.html';
        }
    } else {
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/index.html';
        }
    }
});

const googleLoginBtn = document.getElementById('google-login');
const emailToggleBtn = document.getElementById('email-toggle');
const emailForm = document.getElementById('email-form');
const authError = document.getElementById('auth-error');
const loading = document.getElementById('loading');

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        try {
            loading.style.display = 'block';
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            await createUserProfile(result.user);
        } catch (error) {
            console.error('Google login error:', error);
            showError('Failed to sign in with Google');
            loading.style.display = 'none';
        }
    });
}

if (emailToggleBtn) {
    emailToggleBtn.addEventListener('click', () => {
        emailForm.style.display = emailForm.style.display === 'none' ? 'block' : 'none';
    });
}

if (emailForm) {
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            loading.style.display = 'block';
            authError.style.display = 'none';
            
            let userCredential;
            try {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
            } catch (signInError) {
                if (signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password') {
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                } else {
                    throw signInError;
                }
            }
            
            await createUserProfile(userCredential.user);
        } catch (error) {
            console.error('Email auth error:', error);
            showError(getErrorMessage(error.code));
            loading.style.display = 'none';
        }
    });
}

async function createUserProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            createdAt: new Date(),
            whatsappNumber: null
        });
    }
}

function showError(message) {
    if (authError) {
        authError.textContent = message;
        authError.style.display = 'block';
    }
}

function getErrorMessage(code) {
    const messages = {
        'auth/invalid-email': 'Invalid email address',
        'auth/user-disabled': 'This account has been disabled',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/email-already-in-use': 'Email already in use',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/popup-closed-by-user': 'Sign in cancelled'
    };
    return messages[code] || 'An error occurred. Please try again.';
}

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installPrompt = document.getElementById('install-prompt');
    if (installPrompt) {
        installPrompt.style.display = 'block';
    }
});

const installBtn = document.getElementById('install-btn');
if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response: ${outcome}`);
            deferredPrompt = null;
            document.getElementById('install-prompt').style.display = 'none';
        }
    });
}

export { auth, db };
