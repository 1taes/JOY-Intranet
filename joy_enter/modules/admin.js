// 관리자 기능 모듈
import { userSpreadsheetId, spreadsheetId, currentUser } from './globals.js';
import { getTargetSpreadsheetId, getKoreaTime, formatDate, formatTime } from './utils.js';
import { readFromGoogleSheetWithId, writeToGoogleSheetWithId, batchReadFromGoogleSheetWithId, createSheetIfNotExistsWithId } from './googleSheets.js';
import { invalidateUsersCache, ROLE_LEVELS, ROLE_NAMES } from './auth.js';

// 승인 대기 사용자 표시
export async function displayPendingUsers() {
    const container = document.getElementById('pendingUsers');
    if (!container) return;
    
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) {
        container.innerHTML = '<p>시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const pendingUsers = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // 새 구조: C열(직급)이 빈 값이면 승인 대기
            if (row[0] && (row[2] === '' || row[2] === undefined || row[2] === null)) {
                pendingUsers.push({
                    uid: row[0],
                    name: row[1] || '',
                    registeredAt: '',
                    rowIndex: i + 1
                });
            }
        }
        
        if (pendingUsers.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">승인 대기 중인 사용자가 없습니다.</p>';
            return;
        }
        
        container.innerHTML = pendingUsers.map(user => `
            <div class="pending-user-item">
                <div class="pending-user-info">
                    <strong>${user.uid}</strong>
                    ${user.name ? `<span style="color: var(--text-secondary); margin-left: 10px;">(${user.name})</span>` : ''}
                    ${user.registeredAt ? `<small style="color: var(--text-secondary); margin-left: 10px;">${user.registeredAt}</small>` : ''}
                </div>
                <div class="pending-user-actions">
                    <button class="btn btn-success btn-sm" onclick="approveUser('${user.uid}', ${user.rowIndex})">승인</button>
                    <button class="btn btn-danger btn-sm" onclick="rejectUser('${user.uid}', ${user.rowIndex})">거절</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('승인 대기 사용자 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--error-color);">사용자 목록을 불러오는데 실패했습니다.</p>';
    }
}

// 사용자 권한 관리 표시
export async function displayUserRoleManagement() {
    const container = document.getElementById('userRoleManagement');
    if (!container) return;
    
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) {
        container.innerHTML = '<p>시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const users = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // 새 구조: C열(직급)이 설정되어 있으면 승인된 사용자
            if (row[0] && row[2] !== '' && row[2] !== undefined && row[2] !== null) {
                users.push({
                    uid: row[0],
                    name: row[1] || '',
                    role: parseInt(row[2]) || 0, // C열: 직급
                    rowIndex: i + 1
                });
            }
        }
        
        if (users.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">등록된 사용자가 없습니다.</p>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="user-role-item">
                <div class="user-role-info">
                    <strong>${user.uid}</strong>
                    ${user.name ? `<span style="color: var(--text-secondary); margin-left: 10px;">(${user.name})</span>` : ''}
                    <span class="role-badge ${getRoleBadgeClass(user.role)}">${ROLE_NAMES[user.role] || '일반'}</span>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <select class="user-role-select" onchange="changeUserRole('${user.uid}', ${user.rowIndex}, this.value)">
                        <option value="0" ${user.role === 0 ? 'selected' : ''}>일반</option>
                        <option value="1" ${user.role === 1 ? 'selected' : ''}>간부</option>
                        <option value="2" ${user.role === 2 ? 'selected' : ''}>고위직</option>
                        <option value="3" ${user.role === 3 ? 'selected' : ''}>관리자</option>
                    </select>
                    <button class="btn btn-danger btn-sm" onclick="banUser('${user.uid}', ${user.rowIndex})">추방</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('사용자 권한 관리 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--error-color);">사용자 목록을 불러오는데 실패했습니다.</p>';
    }
}

// 권한 배지 클래스
function getRoleBadgeClass(role) {
    switch (role) {
        case 3: return 'admin';
        case 2: return 'senior';
        case 1: return 'executive';
        default: return 'normal';
    }
}

// 사용자 권한 변경
window.changeUserRole = async function(uid, rowIndex, newRole) {
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const row = rows[rowIndex - 1];
        
        if (!row) {
            alert('사용자를 찾을 수 없습니다.');
            return;
        }
        
        // 새 구조: C열에 직급 설정
        // A열: 고유번호, B열: 이름, C열: 직급, D열: ID, E열: PW
        row[2] = newRole.toString(); // C열: 직급
        
        // 행 데이터를 새 구조에 맞게 정리
        const newRow = [
            row[0] || '', // A열: 고유번호
            row[1] || '', // B열: 이름
            row[2] || '0', // C열: 직급
            row[3] || row[0] || '', // D열: ID (없으면 고유번호)
            row[4] || ''  // E열: PW
        ];
        
        await writeToGoogleSheetWithId(targetSpreadsheetId, '사용자', `A${rowIndex}:E${rowIndex}`, [newRow]);
        
        invalidateUsersCache();
        alert(`${uid}의 권한이 ${ROLE_NAMES[newRole]}(으)로 변경되었습니다.`);
        await displayUserRoleManagement();
        
    } catch (error) {
        console.error('권한 변경 실패:', error);
        alert('권한 변경 중 오류가 발생했습니다.');
    }
};

// 사용자 승인
window.approveUser = async function(uid, rowIndex) {
    if (!confirm(`${uid} 사용자를 승인하시겠습니까?`)) return;
    
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const row = rows[rowIndex - 1];
        
        if (!row) {
            alert('사용자를 찾을 수 없습니다.');
            return;
        }
        
        // 승인 상태 업데이트 (새 구조: C열에 직급 설정)
        // A열: 고유번호, B열: 이름, C열: 직급, D열: ID, E열: PW
        if (!row[2] || row[2] === '') {
            row[2] = '0'; // 직급 설정 (기본: 일반)
        }
        
        // 행 데이터를 새 구조에 맞게 정리
        const newRow = [
            row[0] || '', // A열: 고유번호
            row[1] || '', // B열: 이름
            row[2] || '0', // C열: 직급
            row[3] || row[0] || '', // D열: ID (없으면 고유번호)
            row[4] || ''  // E열: PW
        ];
        
        await writeToGoogleSheetWithId(targetSpreadsheetId, '사용자', `A${rowIndex}:E${rowIndex}`, [newRow]);
        
        invalidateUsersCache();
        alert(`${uid} 사용자가 승인되었습니다.`);
        await displayPendingUsers();
        await displayUserRoleManagement();
        
    } catch (error) {
        console.error('사용자 승인 실패:', error);
        alert('승인 처리 중 오류가 발생했습니다.');
    }
};

// 사용자 거절 (행 삭제)
window.rejectUser = async function(uid, rowIndex) {
    if (!confirm(`${uid} 사용자의 가입을 거절하시겠습니까?\n해당 사용자 정보가 삭제됩니다.`)) return;
    
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) return;
    
    try {
        const { deleteRowFromGoogleSheetWithId } = await import('./googleSheets.js');
        await deleteRowFromGoogleSheetWithId(targetSpreadsheetId, '사용자', rowIndex);
        
        invalidateUsersCache();
        alert(`${uid} 사용자의 가입이 거절되었습니다.`);
        await displayPendingUsers();
        
    } catch (error) {
        console.error('사용자 거절 실패:', error);
        alert('거절 처리 중 오류가 발생했습니다.');
    }
};

// 사용자 추방 (행 삭제)
window.banUser = async function(uid, rowIndex) {
    if (!confirm(`${uid} 사용자를 추방하시겠습니까?\n해당 사용자 정보가 삭제되며, 더 이상 로그인할 수 없습니다.`)) return;
    
    const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
    if (!targetSpreadsheetId) return;
    
    try {
        const { deleteRowFromGoogleSheetWithId } = await import('./googleSheets.js');
        await deleteRowFromGoogleSheetWithId(targetSpreadsheetId, '사용자', rowIndex);
        
        invalidateUsersCache();
        alert(`${uid} 사용자가 추방되었습니다.`);
        await displayUserRoleManagement();
        
    } catch (error) {
        console.error('사용자 추방 실패:', error);
        alert('추방 처리 중 오류가 발생했습니다.');
    }
};

// 주 계산 (월요일 기준)
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

// 주 문자열을 Date로 변환 (해당 주의 월요일)
function getWeekStartDate(weekStr) {
    const [year, week] = weekStr.split('-W').map(Number);
    const startOfYear = new Date(year, 0, 1);
    const startDay = startOfYear.getDay();
    const daysToFirstMonday = startDay === 0 ? 1 : (8 - startDay);
    const firstMonday = new Date(startOfYear);
    firstMonday.setDate(startOfYear.getDate() + daysToFirstMonday);
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

// 주 표시 형식 (예: 2025-W01 → 2025년 1주차)
function formatWeek(weekStr) {
    const [year, week] = weekStr.split('-W');
    return `${year}년 ${parseInt(week)}주차`;
}

// 이전 주 계산
function getPrevWeek(weekStr) {
    const date = getWeekStartDate(weekStr);
    date.setDate(date.getDate() - 7);
    return getWeek(date);
}

// 다음 주 계산
function getNextWeek(weekStr) {
    const date = getWeekStartDate(weekStr);
    date.setDate(date.getDate() + 7);
    return getWeek(date);
}

// 선택된 주 (주급 내보내기용)
let selectedWeeklyPayWeek = getWeek(getKoreaTime());

// 주급 내보내기
export async function exportWeeklyPay() {
    const statusDiv = document.getElementById('weeklyPayExportStatus');
    if (!statusDiv) return;
    
    if (!spreadsheetId) {
        statusDiv.textContent = '시트가 설정되지 않았습니다.';
        statusDiv.className = 'status-message error';
        return;
    }
    
    try {
        statusDiv.textContent = '주급 계산 중...';
        statusDiv.className = 'status-message';
        
        const targetSpreadsheetId = getTargetSpreadsheetId(userSpreadsheetId, spreadsheetId);
        if (!targetSpreadsheetId) {
            statusDiv.textContent = '사용자 시트가 설정되지 않았습니다.';
            statusDiv.className = 'status-message error';
            return;
        }
        
        // 선택된 주 사용
        const selectedWeek = selectedWeeklyPayWeek;
        const weekStart = getWeekStartDate(selectedWeek);
        const weekEnd = getWeekEndDate(selectedWeek);
        const startDateStr = formatDate(weekStart);
        const endDateStr = formatDate(weekEnd);
        
        // 모든 승인된 사용자 가져오기
        const userRows = await readFromGoogleSheetWithId(targetSpreadsheetId, '사용자');
        const users = [];
        
        for (let i = 1; i < userRows.length; i++) {
            const row = userRows[i];
            // 새 구조: C열(직급)이 설정되어 있으면 승인된 사용자
            if (row[0] && row[2] !== '' && row[2] !== undefined && row[2] !== null) {
                users.push({
                    uid: row[0],
                    name: row[1] || '',
                    role: parseInt(row[2]) || 0, // C열: 직급
                    roleName: ROLE_NAMES[parseInt(row[2]) || 0] || '일반'
                });
            }
        }
        
        // 조직도에서 이름 가져오기
        const orgRows = await readFromGoogleSheetWithId(spreadsheetId, '조직도', 'A:F');
        const nameMap = {};
        if (orgRows && orgRows.length > 1) {
            for (let i = 1; i < orgRows.length; i++) {
                const row = orgRows[i];
                const uid = row[4] || ''; // 등록자
                const name = row[0] || ''; // 이름
                if (uid && name) {
                    nameMap[uid] = name;
                }
            }
        }
        
        // 배치로 RP보고서와 이벤트구매 읽기
        const batchData = await batchReadFromGoogleSheetWithId(spreadsheetId, [
            { sheetName: 'RP', range: 'A:G' },
            { sheetName: '이벤트구매', range: 'A:G' }
        ]);
        
        const rpRows = batchData['RP'] || [];
        const eventRows = batchData['이벤트구매'] || [];
        
        // 각 사용자별 주급 계산
        const weeklyPayData = [];
        
        for (const user of users) {
            let rpTotalAmount = 0;
            let eventTotalAmount = 0;
            
            // RP보고서 금액 합계
            if (rpRows && rpRows.length > 1) {
                for (let i = 1; i < rpRows.length; i++) {
                    const row = rpRows[i];
                    const reportDate = row[0] || '';
                    const amount = row[4] || '0';
                    const writerUid = row[6] || '';
                    
                    if (reportDate >= startDateStr && reportDate <= endDateStr && writerUid === user.uid) {
                        const amountNum = parseInt(amount.toString().replace(/[^0-9]/g, '')) || 0;
                        rpTotalAmount += amountNum;
                    }
                }
            }
            
            // 이벤트 구매 금액 합계
            if (eventRows && eventRows.length > 1) {
                for (let i = 1; i < eventRows.length; i++) {
                    const row = eventRows[i];
                    const purchaseDate = row[0] || '';
                    const amount = row[4] || '0';
                    const buyer = row[6] || ''; // 구매자는 G열 (7번째, 인덱스 6)
                    
                    if (purchaseDate >= startDateStr && purchaseDate <= endDateStr && buyer === user.uid) {
                        const amountNum = parseInt(amount.toString().replace(/[^0-9]/g, '')) || 0;
                        eventTotalAmount += amountNum;
                    }
                }
            }
            
            const weeklyPay = rpTotalAmount + eventTotalAmount;
            const userName = user.name || user.uid; // 사용자 시트의 이름 사용, 없으면 고유번호
            
            weeklyPayData.push([
                user.uid,           // A: 고유번호
                userName,           // B: 이름
                user.roleName,      // C: 직급
                weeklyPay.toString() // D: 주급
            ]);
        }
        
        // 주급계산기 시트에 데이터 쓰기
        await createSheetIfNotExistsWithId(spreadsheetId, '주급계산기', ['고유번호', '이름', '직급', '주급']);
        
        // 기존 데이터 확인 및 클리어
        let existingRows = [];
        try {
            existingRows = await readFromGoogleSheetWithId(spreadsheetId, '주급계산기', 'A:D');
            // 헤더 확인 및 추가
            if (!existingRows || existingRows.length === 0 || existingRows[0][0] !== '고유번호') {
                await writeToGoogleSheetWithId(spreadsheetId, '주급계산기', 'A1:D1', [['고유번호', '이름', '직급', '주급']]);
            }
            
            // 기존 데이터 클리어
            if (existingRows && existingRows.length > 1) {
                const clearRange = `A2:D${existingRows.length}`;
                await writeToGoogleSheetWithId(spreadsheetId, '주급계산기', clearRange, Array(existingRows.length - 1).fill(['', '', '', '']));
            }
        } catch (e) {
            // 시트가 비어있을 수 있음
        }
        
        // 새 데이터 쓰기
        if (weeklyPayData.length > 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '주급계산기', 'A2:D' + (weeklyPayData.length + 1), weeklyPayData);
        }
        
        statusDiv.textContent = `${formatWeek(selectedWeek)} 주급 내보내기 완료! (${weeklyPayData.length}명)`;
        statusDiv.className = 'status-message success';
        
    } catch (error) {
        console.error('주급 내보내기 실패:', error);
        statusDiv.textContent = `주급 내보내기 실패: ${error.message}`;
        statusDiv.className = 'status-message error';
    }
}

// 주급 내보내기 주 표시 업데이트
function updateWeeklyPayWeekDisplay() {
    const display = document.getElementById('weeklyPayWeekDisplay');
    if (display) {
        display.innerHTML = `
            <div class="week-navigation">
                <button class="btn btn-sm btn-secondary" onclick="navigateWeeklyPayWeek('prev')" title="이전 주">←</button>
                <span class="week-label">${formatWeek(selectedWeeklyPayWeek)}</span>
                <button class="btn btn-sm btn-secondary" onclick="navigateWeeklyPayWeek('next')" title="다음 주">→</button>
            </div>
        `;
    }
}

// 주급 내보내기 주 네비게이션
window.navigateWeeklyPayWeek = function(direction) {
    if (direction === 'prev') {
        selectedWeeklyPayWeek = getPrevWeek(selectedWeeklyPayWeek);
    } else if (direction === 'next') {
        selectedWeeklyPayWeek = getNextWeek(selectedWeeklyPayWeek);
    }
    updateWeeklyPayWeekDisplay();
};

// 주급 내보내기 버튼 설정
export function setupWeeklyPayExport() {
    // 초기 주 설정
    selectedWeeklyPayWeek = getWeek(getKoreaTime());
    updateWeeklyPayWeekDisplay();
    
    // 버튼 이벤트
    const btn = document.getElementById('exportWeeklyPayBtn');
    if (btn) {
        btn.addEventListener('click', exportWeeklyPay);
    }
}
