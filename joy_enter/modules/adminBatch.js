// 관리 페이지 배치 로드 모듈
import { spreadsheetId } from './globals.js';
import { batchReadFromGoogleSheetWithId } from './googleSheets.js';

// 관리 페이지에서 필요한 모든 시트를 배치로 로드
export async function loadAdminDataBatch() {
    if (!spreadsheetId) return null;
    
    try {
        const batchData = await batchReadFromGoogleSheetWithId(spreadsheetId, [
            { sheetName: '거래항목', range: 'A:D' },
            { sheetName: 'RP항목', range: 'A:B' },
            { sheetName: '이벤트항목', range: 'A:C' },
            { sheetName: '지원권항목', range: 'A:A' },
            { sheetName: '지원권설정', range: 'A:B' },
            { sheetName: '지원권추가', range: 'A:D' },
            { sheetName: '조직도', range: 'A:F' }
        ]);
        
        return batchData;
    } catch (error) {
        console.error('관리 페이지 배치 로드 실패:', error);
        return null;
    }
}




