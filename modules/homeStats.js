// 홈 통계 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate } from './utils.js';
import { batchReadFromGoogleSheetWithId } from './googleSheets.js';

// 주 계산 (YYYY-WW 형식, 월요일 시작)
function getWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    // 월요일을 주의 시작으로 (월요일 = 1, 일요일 = 0)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일로 조정
    const monday = new Date(d);
    monday.setDate(diff);
    
    const year = monday.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    
    // 연초부터의 일수 계산
    const daysDiff = Math.floor((monday - startOfYear) / (24 * 60 * 60 * 1000));
    
    // 주차 계산 (월요일 기준)
    const week = Math.floor(daysDiff / 7) + 1;
    
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// 주 문자열을 Date로 변환 (해당 주의 월요일)
function getWeekStartDate(weekStr) {
    const [year, week] = weekStr.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    
    // 연초의 요일 (0=일요일, 1=월요일, ...)
    const startDay = startOfYear.getDay();
    
    // 첫 번째 월요일까지의 일수
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
    
    // 해당 주차의 월요일
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    
    return targetMonday;
}

// 주의 마지막 날 (일요일) 계산
function getWeekEndDate(weekStr) {
    const monday = getWeekStartDate(weekStr);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return sunday;
}

// 주 표시 형식 (예: 2025-W01 → 2025년 12월 2주차)
function formatWeek(weekStr) {
    const monday = getWeekStartDate(weekStr);
    const year = monday.getFullYear();
    const month = monday.getMonth() + 1;
    
    // 해당 월의 첫 번째 날
    const monthStart = new Date(year, month - 1, 1);
    
    // 해당 월의 첫 번째 월요일 찾기
    const monthStartDay = monthStart.getDay();
    const daysToFirstMonday = monthStartDay === 0 ? 1 : (monthStartDay === 1 ? 0 : 8 - monthStartDay);
    const firstMonday = new Date(monthStart);
    firstMonday.setDate(monthStart.getDate() + daysToFirstMonday);
    
    // 해당 주가 첫 번째 월요일 이후 몇 번째 주인지 계산
    let weekInMonth;
    if (monday < firstMonday) {
        // 해당 주의 월요일이 그 달의 첫 번째 월요일보다 이전이면 이전 달 기준으로 계산
        const prevMonth = month - 1;
        const prevYear = prevMonth === 0 ? year - 1 : year;
        const prevMonthNum = prevMonth === 0 ? 12 : prevMonth;
        const prevMonthStart = new Date(prevYear, prevMonthNum - 1, 1);
        const prevMonthStartDay = prevMonthStart.getDay();
        const prevDaysToFirstMonday = prevMonthStartDay === 0 ? 1 : (prevMonthStartDay === 1 ? 0 : 8 - prevMonthStartDay);
        const prevFirstMonday = new Date(prevMonthStart);
        prevFirstMonday.setDate(prevMonthStart.getDate() + prevDaysToFirstMonday);
        weekInMonth = Math.floor((monday - prevFirstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
        return `${prevYear}년 ${prevMonthNum}월 ${weekInMonth}주차`;
    } else {
        weekInMonth = Math.floor((monday - firstMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
    }
    
    return `${year}년 ${month}월 ${weekInMonth}주차`;
}

// 주별 통계 로드
export async function loadWeeklyStats() {
    if (!currentUser || !spreadsheetId) return;
    
    const currentWeek = getWeek(getKoreaTime());
    const weekStart = getWeekStartDate(currentWeek);
    const weekEnd = getWeekEndDate(currentWeek);
    
    const startDateStr = formatDate(weekStart);
    const endDateStr = formatDate(weekEnd);
    
    let netProfit = 0; // 순수익 (거래 금액 - 공금액)
    let rpCount = 0; // RP보고서 횟수
    let rpTotalAmount = 0; // RP보고서 총 금액
    let eventCount = 0; // 이벤트 횟수
    let eventTotalAmount = 0; // 이벤트 총 금액
    
    try {
        // 배치로 3개 시트 한 번에 읽기
        const batchData = await batchReadFromGoogleSheetWithId(spreadsheetId, [
            { sheetName: '거래', range: 'A:J' },
            { sheetName: 'RP', range: 'A:G' },
            { sheetName: '이벤트구매', range: 'A:G' }
        ]);
        
        // 거래보고서 처리
        const transactionRows = batchData['거래'] || [];
        if (transactionRows && transactionRows.length > 1) {
            for (let i = 1; i < transactionRows.length; i++) {
                const row = transactionRows[i];
                const reportDate = row[0] || '';
                const amount = row[4] || '0';
                const publicDeposit = row[5] || '0';
                const writerUid = row[9] || '';
                
                if (reportDate >= startDateStr && reportDate <= endDateStr && writerUid === currentUser.uid) {
                    const amountNum = parseInt(amount.toString().replace(/[^0-9]/g, '')) || 0;
                    const publicDepositNum = parseInt(publicDeposit.toString().replace(/[^0-9]/g, '')) || 0;
                    netProfit += (amountNum - publicDepositNum);
                }
            }
        }
        
        // RP보고서 처리
        const rpRows = batchData['RP'] || [];
        if (rpRows && rpRows.length > 1) {
            for (let i = 1; i < rpRows.length; i++) {
                const row = rpRows[i];
                const reportDate = row[0] || '';
                const amount = row[4] || '0';
                const writerUid = row[6] || '';
                
                if (reportDate >= startDateStr && reportDate <= endDateStr && writerUid === currentUser.uid) {
                    rpCount++;
                    const amountNum = parseInt(amount.toString().replace(/[^0-9]/g, '')) || 0;
                    rpTotalAmount += amountNum;
                }
            }
        }
        
        // 이벤트 구매 처리
        const eventRows = batchData['이벤트구매'] || [];
        if (eventRows && eventRows.length > 1) {
            for (let i = 1; i < eventRows.length; i++) {
                const row = eventRows[i];
                const purchaseDate = row[0] || '';
                const amount = row[4] || '0';
                const buyer = row[6] || ''; // 구매자는 G열 (7번째, 인덱스 6)
                
                if (purchaseDate >= startDateStr && purchaseDate <= endDateStr && buyer === currentUser.uid) {
                    eventCount++;
                    const amountNum = parseInt(amount.toString().replace(/[^0-9]/g, '')) || 0;
                    eventTotalAmount += amountNum;
                }
            }
        }
    } catch (error) {
        console.log('배치 읽기 실패:', error);
    }
    
    const expectedWeeklyPay = rpTotalAmount + eventTotalAmount;
    
    return {
        week: formatWeek(currentWeek),
        netProfit,
        rpCount,
        rpTotalAmount,
        eventCount,
        eventTotalAmount,
        expectedWeeklyPay
    };
}

// 홈 통계 표시
export async function displayWeeklyStats() {
    const container = document.getElementById('weeklyStats');
    if (!container) return;
    
    const stats = await loadWeeklyStats();
    
    container.innerHTML = `
        <div class="weekly-stats-container">
            <h3>📊 ${stats.week} 통계</h3>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">순수익</div>
                    <div class="stat-value">${stats.netProfit.toLocaleString()}원</div>
                    <div class="stat-desc">거래 금액 - 공금액</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">RP보고서</div>
                    <div class="stat-value">${stats.rpCount}회</div>
                    <div class="stat-desc">${stats.rpTotalAmount.toLocaleString()}원</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">이벤트</div>
                    <div class="stat-value">${stats.eventCount}회</div>
                    <div class="stat-desc">${stats.eventTotalAmount.toLocaleString()}원</div>
                </div>
                <div class="stat-card highlight">
                    <div class="stat-label">예상 주급</div>
                    <div class="stat-value">${stats.expectedWeeklyPay.toLocaleString()}원</div>
                    <div class="stat-desc">RP 총액 + 이벤트 총액</div>
                </div>
            </div>
        </div>
    `;
}

