// 통계 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate } from './utils.js';
import { readFromGoogleSheetWithId, batchReadFromGoogleSheetWithId, deleteRowFromGoogleSheetWithId } from './googleSheets.js';
import { readUsersFromGoogleSheet } from './auth.js';

// 주 계산 (YYYY-WW 형식, 월요일 시작)
function getWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    
    const year = monday.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const daysDiff = Math.floor((monday - startOfYear) / (24 * 60 * 60 * 1000));
    const week = Math.floor(daysDiff / 7) + 1;
    
    return `${year}-W${String(week).padStart(2, '0')}`;
}

// 날짜 문자열을 Date로 변환
function parseDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// 주 시작일 계산 (월요일)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// 주 종료일 계산 (일요일)
function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

// 현재 선택된 주
let selectedStatisticsWeek = getWeek(getKoreaTime());

// 이전 주 계산
function getPrevWeek(weekStr) {
    const date = getWeekStart(parseDate(weekStr.split('-W')[0] + '-01-01'));
    const [year, week] = weekStr.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    const startDay = startOfYear.getDay();
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    targetMonday.setDate(targetMonday.getDate() - 7);
    return getWeek(targetMonday);
}

// 다음 주 계산
function getNextWeek(weekStr) {
    const [year, week] = weekStr.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    const startDay = startOfYear.getDay();
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    targetMonday.setDate(targetMonday.getDate() + 7);
    return getWeek(targetMonday);
}

// 주 표시 형식 (예: 2025-W01 → 2025년 12월 2주차)
function formatWeek(weekStr) {
    const [year, week] = weekStr.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    const startDay = startOfYear.getDay();
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    
    const month = targetMonday.getMonth() + 1;
    const monthStart = new Date(year, month - 1, 1);
    const monthStartDay = monthStart.getDay();
    const daysToFirstMondayInMonth = monthStartDay === 0 ? 1 : (monthStartDay === 1 ? 0 : 8 - monthStartDay);
    const firstMondayInMonth = new Date(monthStart);
    firstMondayInMonth.setDate(monthStart.getDate() + daysToFirstMondayInMonth);
    
    let weekInMonth;
    if (targetMonday < firstMondayInMonth) {
        const prevMonth = month - 1;
        const prevYear = prevMonth === 0 ? year - 1 : year;
        const prevMonthNum = prevMonth === 0 ? 12 : prevMonth;
        const prevMonthStart = new Date(prevYear, prevMonthNum - 1, 1);
        const prevMonthStartDay = prevMonthStart.getDay();
        const daysToFirstMondayInPrevMonth = prevMonthStartDay === 0 ? 1 : (prevMonthStartDay === 1 ? 0 : 8 - prevMonthStartDay);
        const firstMondayInPrevMonth = new Date(prevMonthStart);
        firstMondayInPrevMonth.setDate(prevMonthStart.getDate() + daysToFirstMondayInPrevMonth);
        weekInMonth = Math.floor((targetMonday - firstMondayInPrevMonth) / (7 * 24 * 60 * 60 * 1000)) + 1;
        return `${prevYear}년 ${prevMonthNum}월 ${weekInMonth}주차`;
    } else {
        weekInMonth = Math.floor((targetMonday - firstMondayInMonth) / (7 * 24 * 60 * 60 * 1000)) + 1;
        return `${year}년 ${month}월 ${weekInMonth}주차`;
    }
}

// 통계 초기화
export function setupStatistics() {
    const prevBtn = document.getElementById('statisticsPrevWeekBtn');
    const nextBtn = document.getElementById('statisticsNextWeekBtn');
    
    if (!prevBtn || !nextBtn) return;
    
    // 주 표시 업데이트
    updateStatisticsWeekDisplay();
    
    // 이전 주 버튼
    prevBtn.addEventListener('click', () => {
        selectedStatisticsWeek = getPrevWeek(selectedStatisticsWeek);
        updateStatisticsWeekDisplay();
        loadStatistics();
    });
    
    // 다음 주 버튼
    nextBtn.addEventListener('click', () => {
        selectedStatisticsWeek = getNextWeek(selectedStatisticsWeek);
        updateStatisticsWeekDisplay();
        loadStatistics();
    });
    
    // 초기 로드
    loadStatistics();
}

// 주 표시 업데이트
function updateStatisticsWeekDisplay() {
    const weekInfo = document.getElementById('statisticsWeekInfo');
    if (weekInfo) {
        const weekStart = getWeekStart(parseDate(selectedStatisticsWeek.split('-W')[0] + '-01-01'));
        const [year, week] = selectedStatisticsWeek.split('-W').map(Number);
        const startOfYear = new Date(year, 0, 1);
        const startDay = startOfYear.getDay();
        const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
        const firstMonday = new Date(startOfYear);
        firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
        const targetMonday = new Date(firstMonday);
        targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
        const weekEnd = getWeekEnd(targetMonday);
        
        weekInfo.textContent = `${formatWeek(selectedStatisticsWeek)} (${formatDate(targetMonday)} ~ ${formatDate(weekEnd)})`;
    }
}

// 통계 로드
async function loadStatistics() {
    const userListDiv = document.getElementById('statisticsUserList');
    
    if (!userListDiv) return;
    
    // 선택된 주의 시작일과 종료일 계산
    const [year, week] = selectedStatisticsWeek.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    const startDay = startOfYear.getDay();
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
    const targetMonday = new Date(firstMonday);
    targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
    const weekEnd = getWeekEnd(targetMonday);
    
    const startDateStr = formatDate(targetMonday);
    const endDateStr = formatDate(weekEnd);
    
    userListDiv.innerHTML = '<p>통계를 불러오는 중...</p>';
    
    try {
        // 모든 사용자 가져오기
        const users = await readUsersFromGoogleSheet();
        
        // 배치 API로 모든 데이터 한 번에 읽기
        const batchData = await batchReadFromGoogleSheetWithId(
            spreadsheetId,
            [
                { sheetName: '이벤트구매', range: 'A:G' },
                { sheetName: '지원권사용', range: 'A:E' },
                { sheetName: '거래', range: 'A:J' },
                { sheetName: 'RP', range: 'A:F' }
            ]
        );
        
        const eventRows = batchData['이벤트구매'] || [];
        const voucherRows = batchData['지원권사용'] || [];
        const transactionRows = batchData['거래'] || [];
        const rpRows = batchData['RP'] || [];
        
        const userStats = [];
        
        // 각 사용자별 통계 계산
        for (const user of users) {
            if (!user.uid || !user.approved) continue;
            
            const stats = {
                uid: user.uid,
                name: user.name || user.uid,
                role: user.role || 0,
                events: [],
                vouchers: {
                    remaining: 0,
                    used: []
                },
                transactions: [],
                rpReports: [],
                weeklyStats: {}
            };
            
            // 이벤트 참여 내역
            if (eventRows && eventRows.length > 1) {
                for (let i = 1; i < eventRows.length; i++) {
                    const row = eventRows[i];
                    const date = row[0] || '';
                    const buyer = row[6] || '';
                    
                    if (buyer === user.uid && date >= startDateStr && date <= endDateStr) {
                        stats.events.push({
                            rowIndex: i + 1,
                            date: date,
                            time: row[1] || '',
                            item: row[2] || '',
                            amount: row[4] || '0'
                        });
                    }
                }
            }
            
            // 지원권 사용 내역 및 남은 개수 계산
            if (voucherRows && voucherRows.length > 1) {
                // 먼저 지원권 설정 로드
                let maxCount = 5;
                try {
                    const settingsRows = await readFromGoogleSheetWithId(spreadsheetId, '지원권설정', 'A:B');
                    if (settingsRows && settingsRows.length > 1) {
                        for (let i = 1; i < settingsRows.length; i++) {
                            if (settingsRows[i][0] === '최대횟수') {
                                maxCount = parseInt(settingsRows[i][1]) || 5;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('지원권 설정 로드 실패:', e);
                }
                
                // 사용자별 추가 횟수 확인 (해당 주에 포함되는지 확인)
                let bonusCount = 0;
                try {
                    const bonusRows = await readFromGoogleSheetWithId(spreadsheetId, '지원권추가', 'A:D');
                    if (bonusRows && bonusRows.length > 1) {
                        for (let i = 1; i < bonusRows.length; i++) {
                            const bonusUid = bonusRows[i][1] || '';
                            const bonusWeekStr = bonusRows[i][0] || '';
                            const bonusAmount = parseInt(bonusRows[i][2]) || 0;
                            
                            if (bonusUid === user.uid && bonusWeekStr) {
                                try {
                                    // 주 문자열에서 날짜 추출
                                    let weekStartDate;
                                    if (bonusWeekStr.includes('~')) {
                                        // "2025-01-06~2025-01-12" 형식
                                        const weekParts = bonusWeekStr.split('~');
                                        const startPart = weekParts[0].trim();
                                        weekStartDate = parseDate(startPart);
                                    } else if (bonusWeekStr.match(/^\d{4}-W\d{2}$/)) {
                                        // "2025-W01" 형식
                                        const [year, week] = bonusWeekStr.split('-W').map(Number);
                                        const startOfYear = new Date(year, 0, 1);
                                        const startDay = startOfYear.getDay();
                                        const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
                                        const firstMonday = new Date(startOfYear);
                                        firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
                                        weekStartDate = new Date(firstMonday);
                                        weekStartDate.setDate(firstMonday.getDate() + (week - 1) * 7);
                                    } else {
                                        // 날짜 형식 직접 파싱
                                        weekStartDate = parseDate(bonusWeekStr);
                                    }
                                    
                                    if (weekStartDate && !isNaN(weekStartDate.getTime())) {
                                        // 해당 주에 포함되는지 확인
                                        if (weekStartDate >= targetMonday && weekStartDate <= weekEnd) {
                                            bonusCount += bonusAmount;
                                        }
                                    }
                                } catch (e) {
                                    console.log('주 파싱 실패:', bonusWeekStr, e);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log('지원권 추가 횟수 로드 실패:', e);
                }
                
                let usedCount = 0;
                for (let i = 1; i < voucherRows.length; i++) {
                    const row = voucherRows[i];
                    const date = row[0] || '';
                    const userUid = row[3] || '';
                    
                    if (userUid === user.uid && date >= startDateStr && date <= endDateStr) {
                        usedCount++;
                        stats.vouchers.used.push({
                            rowIndex: i + 1,
                            date: date,
                            time: row[1] || '',
                            item: row[2] || ''
                        });
                    }
                }
                
                stats.vouchers.remaining = Math.max(0, maxCount + bonusCount - usedCount);
            }
            
            // 거래보고서 내역
            if (transactionRows && transactionRows.length > 1) {
                for (let i = 1; i < transactionRows.length; i++) {
                    const row = transactionRows[i];
                    const date = row[0] || '';
                    const writerUid = row[8] || '';
                    
                    if (writerUid === user.uid && date >= startDateStr && date <= endDateStr) {
                        const amount = parseFloat((row[3] || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
                        stats.transactions.push({
                            rowIndex: i + 1,
                            date: date,
                            time: row[9] || '',
                            item: row[1] || '',
                            amount: amount
                        });
                    }
                }
            }
            
            // RP보고서 내역
            if (rpRows && rpRows.length > 1) {
                for (let i = 1; i < rpRows.length; i++) {
                    const row = rpRows[i];
                    const date = row[0] || '';
                    const writerUid = row[4] || '';
                    
                    if (writerUid === user.uid && date >= startDateStr && date <= endDateStr) {
                        const amount = parseFloat((row[5] || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
                        stats.rpReports.push({
                            rowIndex: i + 1,
                            date: date,
                            time: row[1] || '',
                            item: row[2] || '',
                            amount: amount
                        });
                    }
                }
            }
            
            userStats.push(stats);
        }
        
        // 통계 표시
        displayUserStatistics(userStats);
        
    } catch (error) {
        console.error('통계 로드 실패:', error);
        userListDiv.innerHTML = `<p style="color: #dc3545;">통계를 불러오는 중 오류가 발생했습니다: ${error.message}</p>`;
    }
}

// 사용자 통계 표시
function displayUserStatistics(userStats) {
    const userListDiv = document.getElementById('statisticsUserList');
    if (!userListDiv) return;
    
    if (userStats.length === 0) {
        userListDiv.innerHTML = '<p>사용자 데이터가 없습니다.</p>';
        return;
    }
    
    let html = `<h3 style="margin-bottom: 20px;">${formatWeek(selectedStatisticsWeek)} 통계</h3>`;
    
    userStats.forEach((stats, index) => {
        const eventCount = stats.events.length;
        const transactionCount = stats.transactions.length;
        const rpCount = stats.rpReports.length;
        const transactionTotalAmount = stats.transactions.reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0);
        const rpTotalAmount = stats.rpReports.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
        
        html += `
            <div class="statistics-user-card" style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: white;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0;">${stats.name} (${stats.uid})</h4>
                    <button class="btn btn-primary btn-sm" onclick="showUserDetail(${index})">상세보기</button>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
                    <div style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">이벤트 참여</div>
                        <div style="font-size: 18px; font-weight: bold;">${eventCount}건</div>
                    </div>
                    <div style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">지원권 남은 개수</div>
                        <div style="font-size: 18px; font-weight: bold;">${stats.vouchers.remaining}장</div>
                    </div>
                    <div style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">지원권 사용</div>
                        <div style="font-size: 18px; font-weight: bold;">${stats.vouchers.used.length}건</div>
                    </div>
                </div>
                
                <div style="margin-top: 10px;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">이벤트 참여 내역</div>
                    <div style="font-size: 14px;">
                        ${stats.events.length > 0 
                            ? stats.events.slice(0, 3).map((e, idx) => `${e.date} ${e.item} <button class="btn btn-danger btn-xs" onclick="deleteStatisticsEvent('${stats.uid}', ${e.rowIndex}, ${index}, ${idx})" style="padding: 2px 6px; font-size: 10px; margin-left: 5px;">삭제</button>`).join(', ') + (stats.events.length > 3 ? '...' : '')
                            : '없음'}
                    </div>
                </div>
                
                <div style="margin-top: 10px;">
                    <div style="font-size: 12px; color: #666; margin-bottom: 5px;">지원권 사용 내역</div>
                    <div style="font-size: 14px;">
                        ${stats.vouchers.used.length > 0 
                            ? stats.vouchers.used.slice(0, 3).map((v, idx) => `${v.date} ${v.item} <button class="btn btn-danger btn-xs" onclick="deleteStatisticsVoucher('${stats.uid}', ${v.rowIndex}, ${index}, ${idx})" style="padding: 2px 6px; font-size: 10px; margin-left: 5px;">삭제</button>`).join(', ') + (stats.vouchers.used.length > 3 ? '...' : '')
                            : '없음'}
                    </div>
                </div>
                
                <!-- 상세 정보 (숨김) -->
                <div id="userDetail_${index}" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                    <h4>거래보고서 내역 (${transactionCount}건)</h4>
                    <div style="max-height: 200px; overflow-y: auto; margin-bottom: 15px;">
                        ${transactionCount > 0 
                            ? `<table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f0f0f0;">
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">날짜</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">시간</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">항목</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">금액</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.transactions.map((t, idx) => `
                                        <tr>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${t.date}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${t.time || '-'}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${t.item}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseInt(t.amount).toLocaleString()}원</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                                                <button class="btn btn-danger btn-xs" onclick="deleteStatisticsTransaction('${stats.uid}', ${t.rowIndex}, ${index}, ${idx})" style="padding: 2px 6px; font-size: 10px;">삭제</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>`
                            : '<p>거래보고서 내역이 없습니다.</p>'}
                    </div>
                    
                    <h4>RP보고서 내역 (${rpCount}건)</h4>
                    <div style="max-height: 200px; overflow-y: auto; margin-bottom: 15px;">
                        ${rpCount > 0 
                            ? `<table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #f0f0f0;">
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">날짜</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">시간</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">항목</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">금액</th>
                                        <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">삭제</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${stats.rpReports.map((r, idx) => `
                                        <tr>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${r.date}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${r.time || '-'}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd;">${r.item}</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${parseInt(r.amount).toLocaleString()}원</td>
                                            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">
                                                <button class="btn btn-danger btn-xs" onclick="deleteStatisticsRp('${stats.uid}', ${r.rowIndex}, ${index}, ${idx})" style="padding: 2px 6px; font-size: 10px;">삭제</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>`
                            : '<p>RP보고서 내역이 없습니다.</p>'}
                    </div>
                    
                    <h4>주 실적 요약</h4>
                    <div style="border: 1px solid #ddd; border-radius: 5px; padding: 10px; background: #f9f9f9;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                            <div>
                                <div style="font-size: 12px; color: #666;">거래보고서</div>
                                <div style="font-size: 16px; font-weight: bold;">${transactionCount}건 / ${transactionTotalAmount.toLocaleString()}원</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: #666;">RP보고서</div>
                                <div style="font-size: 16px; font-weight: bold;">${rpCount}건 / ${rpTotalAmount.toLocaleString()}원</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    userListDiv.innerHTML = html;
    
    // 전역 변수에 저장 (상세보기 함수에서 사용)
    window.userStatsData = userStats;
}

// 사용자 상세 정보 표시/숨김
window.showUserDetail = function(index) {
    const detailDiv = document.getElementById(`userDetail_${index}`);
    if (!detailDiv) return;
    
    if (detailDiv.style.display === 'none') {
        detailDiv.style.display = 'block';
    } else {
        detailDiv.style.display = 'none';
    }
};

// 이벤트 참여 내역 삭제
window.deleteStatisticsEvent = async function(userUid, rowIndex, userIndex, eventIndex) {
    if (!confirm('이 이벤트 참여 내역을 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '이벤트구매', rowIndex);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadStatistics();
    } catch (error) {
        console.error('이벤트 참여 내역 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// 지원권 사용 내역 삭제
window.deleteStatisticsVoucher = async function(userUid, rowIndex, userIndex, voucherIndex) {
    if (!confirm('이 지원권 사용 내역을 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '지원권사용', rowIndex);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadStatistics();
    } catch (error) {
        console.error('지원권 사용 내역 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// 거래보고서 삭제
window.deleteStatisticsTransaction = async function(userUid, rowIndex, userIndex, transactionIndex) {
    if (!confirm('이 거래보고서를 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '거래', rowIndex);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadStatistics();
    } catch (error) {
        console.error('거래보고서 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// RP보고서 삭제
window.deleteStatisticsRp = async function(userUid, rowIndex, userIndex, rpIndex) {
    if (!confirm('이 RP보고서를 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, 'RP', rowIndex);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadStatistics();
    } catch (error) {
        console.error('RP보고서 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

