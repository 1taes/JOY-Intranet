// 전역 변수 관리 모듈

// 구글 시트 관련
export let spreadsheetId = null;
export let userSpreadsheetId = null;
export let apiKey = null;
export let serviceAccountData = null;
export let userServiceAccountData = null;

// 현재 사용자
export let currentUser = null;

// 전역 변수 업데이트 함수
export function updateGlobal(key, value) {
    switch (key) {
        case 'spreadsheetId':
            spreadsheetId = value;
            break;
        case 'userSpreadsheetId':
            userSpreadsheetId = value;
            break;
        case 'apiKey':
            apiKey = value;
            break;
        case 'serviceAccountData':
            serviceAccountData = value;
            break;
        case 'userServiceAccountData':
            userServiceAccountData = value;
            break;
        case 'currentUser':
            currentUser = value;
            break;
    }
}

// 전역 변수 초기화
export async function initGlobals() {
    console.log('전역 변수 초기화 중...');
    
    // 설정 파일에서 로드 (config.json이 있으면)
    try {
        const response = await fetch('config.json');
        if (response.ok) {
            const config = await response.json();
            spreadsheetId = config.spreadsheetId || null;
            userSpreadsheetId = config.userSpreadsheetId || null;
            apiKey = config.apiKey || null;
            console.log('설정 파일 로드 완료');
        }
    } catch (error) {
        console.log('설정 파일이 없습니다. 기본값 사용');
    }
    
    // 서비스 계정 파일 로드 (있으면)
    try {
        const response = await fetch('service-account.json');
        if (response.ok) {
            serviceAccountData = await response.json();
            console.log('서비스 계정 로드 완료');
        }
    } catch (error) {
        console.log('서비스 계정 파일이 없습니다');
    }
    
    // 보안 시트용 서비스 계정 로드 (있으면)
    try {
        const response = await fetch('user-service-account.json');
        if (response.ok) {
            userServiceAccountData = await response.json();
            console.log('보안 서비스 계정 로드 완료');
        }
    } catch (error) {
        console.log('보안 서비스 계정 파일이 없습니다');
    }
    
    console.log('전역 변수 초기화 완료');
}




