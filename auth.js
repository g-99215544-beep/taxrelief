// Simple user selection - no Firebase Auth needed
// Users are identified by localStorage 'currentUser' key: 'sufian' or 'hanis'

function getCurrentUser() {
    return localStorage.getItem('currentUser');
}

function requireUser() {
    if (!getCurrentUser()) {
        window.location.href = 'index.html';
    }
}

export { getCurrentUser, requireUser };
