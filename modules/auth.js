// 인증 모듈
import { currentUser, updateGlobal, userSpreadsheetId, spreadsheetId } from './globals.js';
import { encryptPassword, getTargetSpreadsheetId, getKoreaTime, formatDate, formatTime } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, writeToGoogleSheetWithId } from './googleSheets.js';

// 권한 레벨: 일반(0), 간부(1), 고위직(2), 관리자(3)
export const ROLE_LEVELS = {
    NORMAL: 0,    // 일반
    EXECUTIVE: 1, // 간부
    SENIOR: 2,    // 고위직
    ADMIN: 3      // 관리자
};

export const ROLE_NAMES = {
    0: '일반',
    1: '간부',
    2: '고위직',
    3: '관리자'
};


// 사용자 캐시
let usersCache = null;
let usersCacheTime = 0;
const USERS_CACHE_DURATION = 60000; // 1분

// 구글 시트에서 사용자 읽기
export async function readUsersFromGoogleSheet() {
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    
    if (!targetSpreadsheetId) {
        return [];
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const users = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row[0]) {
                const roleValue = parseInt(row[2]) || 0; // C열: 직급
                // 직급이 설정되어 있으면 승인된 것으로 간주 (0도 유효한 값이므로 항상 true)
                const approved = row[2] !== '' && row[2] !== undefined && row[2] !== null;
                users.push({
                    uid: row[0] || '', // A열: 고유번호
                    name: row[1] || '', // B열: 이름
                    password: row[4] || '', // E열: PW
                    approved: approved,
                    isAdmin: roleValue >= ROLE_LEVELS.ADMIN,
                    role: roleValue, // 0:일반, 1:간부, 2:고위직, 3:관리자
                    registeredAt: '',
                    approvedAt: ''
                });
            }
        }
        return users;
    } catch (error) {
        console.error('사용자 읽기 실패:', error);
        return [];
    }
}

// 권한 체크 함수
export function hasRole(user, minRole) {
    if (!user) return false;
    return (user.role || 0) >= minRole;
}

export function isExecutive(user) {
    return hasRole(user, ROLE_LEVELS.EXECUTIVE);
}

export function isSenior(user) {
    return hasRole(user, ROLE_LEVELS.SENIOR);
}

export function isAdmin(user) {
    return hasRole(user, ROLE_LEVELS.ADMIN) || user?.isAdmin;
}

// 캐시된 사용자 목록 가져오기
async function getUsersFromSheet() {
    const now = Date.now();
    if (usersCache && (now - usersCacheTime) < USERS_CACHE_DURATION) {
        return usersCache;
    }
    
    usersCache = await readUsersFromGoogleSheet();
    usersCacheTime = now;
    return usersCache;
}

// 로그인 체크
export async function checkLogin() {
    const autoLoginData = localStorage.getItem('autoLogin');
    if (autoLoginData) {
        try {
            const autoLogin = JSON.parse(autoLoginData);
            const users = await getUsersFromSheet();
            const user = users.find(u => u.uid === autoLogin.uid && u.password === autoLogin.password);
            
            if (user && user.approved) {
                updateGlobal('currentUser', user);
                return true;
            }
        } catch (error) {
            console.error('자동 로그인 실패:', error);
            localStorage.removeItem('autoLogin');
        }
    }
    return false;
}

// 로그인 처리
async function handleLogin(uid, password, autoLogin = false) {
    const users = await getUsersFromSheet();
    const encryptedPassword = encryptPassword(password);
    const user = users.find(u => u.uid === uid && u.password === encryptedPassword);
    
    if (!user) {
        return { success: false, message: '고유번호 또는 비밀번호가 올바르지 않습니다.' };
    }
    
    if (!user.approved) {
        return { success: false, message: '아직 승인되지 않은 계정입니다.' };
    }
    
    updateGlobal('currentUser', user);
    
    if (autoLogin) {
        localStorage.setItem('autoLogin', JSON.stringify({
            uid: user.uid,
            password: user.password
        }));
    }
    
    return { success: true };
}

// 회원가입 처리
async function handleRegister(uid, name, password) {
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) {
        return { success: false, message: '시트가 설정되지 않았습니다.' };
    }
    
    // 중복 체크
    try {
        const existingUsers = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const existingUser = existingUsers.find(row => row[0] === uid);
        if (existingUser) {
            return { success: false, message: '이미 등록된 고유번호입니다.' };
        }
    } catch (error) {
        // 시트가 없을 수 있음
    }
    
    const encryptedPassword = encryptPassword(password);
    
    try {
        // 새 시트 구조: A열(고유번호), B열(이름), C열(직급), D열(ID), E열(PW)
        // 직급을 빈 값으로 설정하여 승인 대기 상태로 만듦
        await saveToGoogleSheetWithId(targetSpreadsheetId, '사용자', [
            uid,              // A열: 고유번호
            name,             // B열: 이름
            '',               // C열: 직급 (승인 시 설정됨)
            uid,              // D열: ID (고유번호와 동일)
            encryptedPassword // E열: PW
        ], ['고유번호', '이름', '직급', 'ID', 'PW']);
        
        return { success: true };
    } catch (error) {
        console.error('회원가입 실패:', error);
        return { success: false, message: '회원가입에 실패했습니다.' };
    }
}

// 인증 설정
export function setupAuth() {
    setupLoginModal();
    setupRegisterModal();
    setupLogout();
}

// 로그인 모달 설정
function setupLoginModal() {
    const loginModal = document.getElementById('loginModal');
    const uidInput = document.getElementById('loginUid');
    const passwordInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('submitLoginBtn');
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const errorDiv = document.getElementById('loginError');
    const autoLoginCheckbox = document.getElementById('autoLoginCheckbox');
    
    const doLogin = async () => {
        const uid = uidInput.value.trim();
        const password = passwordInput.value;
        
        if (!uid || !password) {
            errorDiv.textContent = '모든 필드를 입력해주세요.';
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = '로그인 중...';
        
        const result = await handleLogin(uid, password, autoLoginCheckbox.checked);
        
        if (result.success) {
            loginModal.style.display = 'none';
            window.showMainContainer();
        } else {
            errorDiv.textContent = result.message;
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
    };
    
    submitBtn.addEventListener('click', doLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    
    showRegisterBtn.addEventListener('click', () => {
        loginModal.style.display = 'none';
        document.getElementById('registerModal').style.display = 'flex';
    });
}

// 회원가입 모달 설정
function setupRegisterModal() {
    const registerModal = document.getElementById('registerModal');
    const uidInput = document.getElementById('registerUid');
    const nameInput = document.getElementById('registerName');
    const passwordInput = document.getElementById('registerPassword');
    const passwordConfirmInput = document.getElementById('registerPasswordConfirm');
    const submitBtn = document.getElementById('submitRegisterBtn');
    const cancelBtn = document.getElementById('cancelRegisterBtn');
    const errorDiv = document.getElementById('registerError');
    
    submitBtn.addEventListener('click', async () => {
        const uid = uidInput.value.trim();
        const name = nameInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;
        
        if (!uid || !name || !password || !passwordConfirm) {
            errorDiv.textContent = '모든 필드를 입력해주세요.';
            return;
        }
        
        if (password !== passwordConfirm) {
            errorDiv.textContent = '비밀번호가 일치하지 않습니다.';
            return;
        }
        
        if (password.length < 4) {
            errorDiv.textContent = '비밀번호는 최소 4자 이상이어야 합니다.';
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = '가입 중...';
        
        const result = await handleRegister(uid, name, password);
        
        if (result.success) {
            alert('회원가입 신청이 완료되었습니다.\n관리자 승인 후 로그인할 수 있습니다.');
            registerModal.style.display = 'none';
            document.getElementById('loginModal').style.display = 'flex';
            uidInput.value = '';
            nameInput.value = '';
            passwordInput.value = '';
            passwordConfirmInput.value = '';
        } else {
            errorDiv.textContent = result.message;
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = '가입 신청';
    });
    
    cancelBtn.addEventListener('click', () => {
        registerModal.style.display = 'none';
        document.getElementById('loginModal').style.display = 'flex';
        uidInput.value = '';
        nameInput.value = '';
        passwordInput.value = '';
        passwordConfirmInput.value = '';
        errorDiv.textContent = '';
    });
}

// 로그아웃 설정
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;
    
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('autoLogin');
        updateGlobal('currentUser', null);
        document.getElementById('mainContainer').style.display = 'none';
        document.getElementById('loginModal').style.display = 'flex';
        location.reload();
    });
}

// 사용자 캐시 무효화
export function invalidateUsersCache() {
    usersCache = null;
    usersCacheTime = 0;
}

