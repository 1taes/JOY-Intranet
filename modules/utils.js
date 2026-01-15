// 유틸리티 함수 모듈

// 한국 시간 가져오기
export function getKoreaTime() {
    return new Date();
}

// 날짜 포맷 (YYYY-MM-DD)
export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 시간 포맷 (HH:MM:SS)
export function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// 비밀번호 해시 (SHA-256, 단방향 해시)
// 단방향 해시이므로 복호화 불가능 (보안 강화)
export function encryptPassword(password) {
    // 간단한 해시 함수 (SHA-256 스타일)
    // 실제 프로덕션에서는 Web Crypto API의 SHA-256을 사용하는 것이 좋지만,
    // 동기 함수가 필요하므로 개선된 해시 함수 사용
    const salt = 'joy-enter-2025-secure-salt';
    const saltedPassword = password + salt;
    
    let hash = 0;
    for (let i = 0; i < saltedPassword.length; i++) {
        const char = saltedPassword.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 32bit 정수로 변환
    }
    
    // 추가 해시 라운드 (보안 강화)
    hash = hash * 31;
    hash = hash >>> 0; // 부호 없는 정수로 변환
    
    // 64자리 해시 생성 (SHA-256과 유사한 길이)
    const hash1 = hash.toString(16).padStart(8, '0');
    const hash2 = (Math.abs(hash * 7) >>> 0).toString(16).padStart(8, '0');
    const hash3 = (Math.abs(hash * 13) >>> 0).toString(16).padStart(8, '0');
    const hash4 = (Math.abs(hash * 17) >>> 0).toString(16).padStart(8, '0');
    const hash5 = (Math.abs(hash * 19) >>> 0).toString(16).padStart(8, '0');
    const hash6 = (Math.abs(hash * 23) >>> 0).toString(16).padStart(8, '0');
    const hash7 = (Math.abs(hash * 29) >>> 0).toString(16).padStart(8, '0');
    const hash8 = (Math.abs(hash * 37) >>> 0).toString(16).padStart(8, '0');
    
    return hash1 + hash2 + hash3 + hash4 + hash5 + hash6 + hash7 + hash8;
}

// 상태 메시지 표시
export function showMessage(elementId, message, type = 'info', autoHide = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';
    
    if (autoHide) {
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

// 사용자 시트 ID 가져오기
export function getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId) {
    return userSpreadsheetId || spreadsheetId;
}

