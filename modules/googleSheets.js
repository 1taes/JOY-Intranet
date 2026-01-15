// 구글 시트 연동 모듈
import { spreadsheetId, userSpreadsheetId, apiKey, serviceAccountData, userServiceAccountData } from './globals.js';

// 하드코딩된 보안 시트 ID (필요시 수정)
const HARDCODED_USER_SPREADSHEET_ID = '';

// 캐시 관리
const cache = new Map();
const CACHE_DURATION = 30000; // 30초

// 캐시 무효화
function invalidateCache(targetSpreadsheetId, sheetName) {
    // 해당 시트의 모든 range 캐시 삭제
    const prefix = `${targetSpreadsheetId}:${sheetName}:`;
    for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
            cache.delete(key);
        }
    }
}

// 시트 이름 URL 인코딩
function encodeSheetNameForUrl(sheetName) {
    return encodeURIComponent(sheetName);
}

// OAuth2 토큰 가져오기
let cachedToken = null;
let tokenExpiry = null;
let cachedUserToken = null;
let userTokenExpiry = null;

async function getAccessToken(isUserSheet = false) {
    const now = Date.now();
    
    if (isUserSheet) {
        if (cachedUserToken && userTokenExpiry && now < userTokenExpiry) {
            return cachedUserToken;
        }
        
        if (!userServiceAccountData) {
            return null;
        }
        
        try {
            const token = await generateJWT(userServiceAccountData);
            cachedUserToken = token;
            userTokenExpiry = now + 3500000; // 약 58분
            return token;
        } catch (error) {
            console.error('보안 시트 토큰 생성 실패:', error);
            return null;
        }
    } else {
        if (cachedToken && tokenExpiry && now < tokenExpiry) {
            return cachedToken;
        }
        
        if (!serviceAccountData) {
            return null;
        }
        
        try {
            const token = await generateJWT(serviceAccountData);
            cachedToken = token;
            tokenExpiry = now + 3500000;
            return token;
        } catch (error) {
            console.error('토큰 생성 실패:', error);
            return null;
        }
    }
}

// JWT 생성
async function generateJWT(serviceAccount) {
    const header = {
        alg: 'RS256',
        typ: 'JWT'
    };
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };
    
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    // 개인 키로 서명
    const privateKey = serviceAccount.private_key;
    const signature = await signWithPrivateKey(signatureInput, privateKey);
    
    const jwt = `${signatureInput}.${signature}`;
    
    // 토큰 교환
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    
    if (!response.ok) {
  const text = await response.text();
  throw new Error(`토큰 교환 실패: ${response.status} ${text}`);
}
    
    const data = await response.json();
    return data.access_token;
}

// 개인 키로 서명
async function signWithPrivateKey(data, privateKeyPem) {
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        encoder.encode(data)
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// 시트 읽기
export async function readFromGoogleSheetWithId(targetSpreadsheetId, sheetName, range = 'A:Z') {
    if (!targetSpreadsheetId) {
        throw new Error('구글 시트 ID가 설정되지 않았습니다.');
    }
    
    const cacheKey = `${targetSpreadsheetId}:${sheetName}:${range}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_DURATION) {
        return cached.data;
    }
    
    const encodedSheetName = encodeSheetNameForUrl(sheetName);
    let url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodedSheetName}!${range}`;
    
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    if (!authHeader && apiKey) {
        url += `?key=${encodeURIComponent(apiKey)}`;
    }
    
    const headers = authHeader ? { 'Authorization': authHeader } : {};
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error(`[API] 시트 읽기 실패 - ${sheetName}: ${errorMessage}`);
        throw new Error(`시트 읽기 실패: ${errorMessage}`);
    }
    
    const data = await response.json();
    const values = data.values || [];
    
    cache.set(cacheKey, { data: values, time: Date.now() });
    return values;
}

// 배치 읽기 (여러 시트를 한 번에 읽기)
export async function batchReadFromGoogleSheetWithId(targetSpreadsheetId, sheetRanges) {
    if (!targetSpreadsheetId) {
        throw new Error('구글 시트 ID가 설정되지 않았습니다.');
    }
    
    // sheetRanges 형식: [{sheetName: '시트명', range: 'A:Z'}, ...]
    // 또는 간단한 형식: ['시트1', '시트2'] (기본 범위 A:Z 사용)
    
    let ranges = [];
    if (Array.isArray(sheetRanges) && sheetRanges.length > 0) {
        if (typeof sheetRanges[0] === 'string') {
            // 간단한 형식: ['시트1', '시트2']
            ranges = sheetRanges.map(sheetName => {
                // 시트 이름에 특수 문자가 있으면 작은따옴표로 감싸기
                const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
                return `${quotedName}!A:Z`;
            });
        } else {
            // 객체 형식: [{sheetName: '시트1', range: 'A:J'}, ...]
            ranges = sheetRanges.map(({sheetName, range = 'A:Z'}) => {
                // 시트 이름에 특수 문자가 있으면 작은따옴표로 감싸기
                const quotedName = `'${sheetName.replace(/'/g, "''")}'`;
                return `${quotedName}!${range}`;
            });
        }
    } else {
        throw new Error('시트 범위가 올바르지 않습니다.');
    }
    
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    let url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values:batchGet?ranges=${ranges.map(r => encodeURIComponent(r)).join('&ranges=')}`;
    
    if (!authHeader && apiKey) {
        url += `&key=${encodeURIComponent(apiKey)}`;
    }
    
    const headers = authHeader ? { 'Authorization': authHeader } : {};
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error(`[API] 배치 읽기 실패: ${errorMessage}`);
        throw new Error(`배치 읽기 실패: ${errorMessage}`);
    }
    
    const data = await response.json();
    const result = {};
    
    if (data.valueRanges) {
        data.valueRanges.forEach((valueRange, index) => {
            const sheetName = typeof sheetRanges[0] === 'string' 
                ? sheetRanges[index] 
                : sheetRanges[index].sheetName;
            result[sheetName] = valueRange.values || [];
            
            // 캐시에도 저장
            const range = typeof sheetRanges[0] === 'string' 
                ? 'A:Z' 
                : (sheetRanges[index].range || 'A:Z');
            const cacheKey = `${targetSpreadsheetId}:${sheetName}:${range}`;
            cache.set(cacheKey, { data: valueRange.values || [], time: Date.now() });
        });
    }
    
    return result;
}

// 시트 쓰기
export async function writeToGoogleSheetWithId(targetSpreadsheetId, sheetName, range, values) {
    if (!targetSpreadsheetId) {
        throw new Error('구글 시트 ID가 설정되지 않았습니다.');
    }
    
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    if (!authHeader) {
        throw new Error('OAuth2 인증이 필요합니다.');
    }
    
    const encodedSheetName = encodeSheetNameForUrl(sheetName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodedSheetName}!${range}?valueInputOption=RAW`;
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({ values })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error(`[API] 시트 쓰기 실패 - ${sheetName}: ${errorMessage}`);
        throw new Error(`시트 쓰기 실패: ${errorMessage}`);
    }
    
    invalidateCache(targetSpreadsheetId, sheetName);
    return await response.json();
}

// 시트에 새 행 추가
export async function saveToGoogleSheetWithId(targetSpreadsheetId, sheetName, rowData, headers = null) {
    if (!targetSpreadsheetId) {
        throw new Error('구글 시트 ID가 설정되지 않았습니다.');
    }
    
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    // A열 기준으로 마지막 행 찾기
    let nextRow = 1;
    let existingRows = [];
    let hasHeader = false;
    
    try {
        existingRows = await readFromGoogleSheetWithId(targetSpreadsheetId, sheetName, 'A:A');
        
        // 헤더가 있는지 확인
        if (headers && headers.length > 0 && existingRows.length > 0) {
            hasHeader = existingRows[0] && existingRows[0][0] === headers[0];
        }
        
        // 다음 행 계산: 헤더가 있으면 기존 행 수 다음, 없으면 기존 행 수 다음 (같음)
        // 하지만 헤더를 추가하면 nextRow를 2로 설정해야 함
        nextRow = existingRows.length + 1;
        
    } catch (error) {
        // 시트가 없으면 생성 시도
        try {
            await createSheetIfNotExistsWithId(targetSpreadsheetId, sheetName);
        } catch (e) {
            console.error('시트 생성 실패:', e);
        }
        nextRow = 1;
        hasHeader = false;
    }
    
    // 헤더 추가 (헤더가 없을 때만)
    if (headers && headers.length > 0 && !hasHeader) {
        try {
            // 헤더 범위를 정확히 계산 (예: A1:E1)
            const endColumn = String.fromCharCode(64 + headers.length);
            const headerRange = `A1:${endColumn}1`;
            await writeToGoogleSheetWithId(targetSpreadsheetId, sheetName, headerRange, [headers]);
            // 헤더를 추가했으므로 다음 행은 2행
            nextRow = 2;
        } catch (e) {
            console.error('헤더 쓰기 실패:', e);
            // 헤더 추가 실패해도 계속 진행
        }
    }
    
    // 데이터 쓰기 (헤더가 이미 있으면 nextRow는 이미 올바르게 계산됨)
    const endColumn = String.fromCharCode(64 + rowData.length);
    const range = `A${nextRow}:${endColumn}${nextRow}`;
    
    return await writeToGoogleSheetWithId(targetSpreadsheetId, sheetName, range, [rowData]);
}

// 시트 생성
export async function createSheetIfNotExistsWithId(targetSpreadsheetId, sheetName, headers = null) {
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    if (!authHeader) {
        throw new Error('시트 생성에는 OAuth2 인증이 필요합니다.');
    }
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}:batchUpdate`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({
            requests: [{
                addSheet: {
                    properties: { title: sheetName }
                }
            }]
        })
    });
    
    // 이미 존재하는 시트 에러는 무시 (409 또는 에러 메시지에 "already exists" 포함)
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || '';
        
        // 이미 존재하면 성공으로 처리
        if (errorMessage.includes('already exists') || response.status === 409) {
            console.log(`[API] 시트 "${sheetName}" 이미 존재함`);
            return true;
        }
        
        console.error(`[API] 시트 생성 실패 - ${sheetName}: ${errorMessage}`);
        return false;
    }
    
    console.log(`[API] 시트 "${sheetName}" 생성 완료`);
    
    if (headers) {
        await writeToGoogleSheetWithId(targetSpreadsheetId, sheetName, 'A1', [headers]);
    }
    
    return true;
}

// 행 삭제
export async function deleteRowFromGoogleSheetWithId(targetSpreadsheetId, sheetName, rowIndex) {
    const isUserSheet = targetSpreadsheetId === userSpreadsheetId || targetSpreadsheetId === HARDCODED_USER_SPREADSHEET_ID;
    let authHeader = '';
    
    if (isUserSheet && userServiceAccountData) {
        const token = await getAccessToken(true);
        if (token) authHeader = `Bearer ${token}`;
    } else if (!isUserSheet && serviceAccountData) {
        const token = await getAccessToken(false);
        if (token) authHeader = `Bearer ${token}`;
    }
    
    if (!authHeader) {
        throw new Error('행 삭제에는 OAuth2 인증이 필요합니다.');
    }
    
    // 시트 ID 가져오기
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}?fields=sheets.properties`;
    const metaResponse = await fetch(metaUrl, {
        headers: { 'Authorization': authHeader }
    });
    
    if (!metaResponse.ok) {
        throw new Error('시트 정보 가져오기 실패');
    }
    
    const metaData = await metaResponse.json();
    const sheet = metaData.sheets.find(s => s.properties.title === sheetName);
    
    if (!sheet) {
        throw new Error(`시트를 찾을 수 없습니다: ${sheetName}`);
    }
    
    const sheetId = sheet.properties.sheetId;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}:batchUpdate`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        },
        body: JSON.stringify({
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1,
                        endIndex: rowIndex
                    }
                }
            }]
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error(`[API] 행 삭제 실패 - ${sheetName}:${rowIndex}: ${errorMessage}`);
        throw new Error(`행 삭제 실패: ${errorMessage}`);
    }
    
    invalidateCache(targetSpreadsheetId, sheetName);
    return true;
}

