// 지원권 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate, formatTime } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, deleteRowFromGoogleSheetWithId, writeToGoogleSheetWithId } from './googleSheets.js';

// 지원권 항목 목록
let voucherTypes = [];

// 월 최대 사용 횟수 (기본값)
let maxVoucherCount = 5;

// 사용자별 추가 횟수
let userBonusCount = 0;

// 현재 월 (YYYY-MM 형식)
function getCurrentMonth() {
    const now = getKoreaTime();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

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

// 이전 주 계산
function getPreviousWeek(weekStr) {
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

// 주 표시 형식 (예: 2025-W01 → 2025년 1주차)
function formatWeek(weekStr) {
    const [year, week] = weekStr.split('-W');
    return `${year}년 ${parseInt(week)}주차`;
}

// 현재 선택된 주 (관리자용)
let selectedWeek = getWeek(getKoreaTime());

// 설정 로드 (최대 횟수)
async function loadVoucherSettings() {
    if (!spreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권설정', 'A:B');
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] === '최대횟수') {
                    maxVoucherCount = parseInt(rows[i][1]) || 5;
                    break;
                }
            }
        }
    } catch (error) {
        console.log('지원권 설정 로드 실패, 기본값 사용:', error);
    }
}

// 사용자별 추가 횟수 로드
async function loadUserBonusCount() {
    if (!currentUser || !spreadsheetId) {
        userBonusCount = 0;
        return;
    }
    
    const currentMonth = getCurrentMonth();
    userBonusCount = 0;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권추가', 'A:D');
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const month = row[0] || '';
                const uid = row[1] || '';
                const bonus = parseInt(row[2]) || 0;
                
                if (month === currentMonth && uid === currentUser.uid) {
                    userBonusCount += bonus;
                }
            }
        }
    } catch (error) {
        console.log('추가 횟수 로드 실패:', error);
    }
}

// 지원권 항목 로드
export async function loadVoucherTypes() {
    if (!spreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권항목', 'A:A');
        voucherTypes = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    voucherTypes.push({
                        name: rows[i][0],
                        rowIndex: i + 1
                    });
                }
            }
        }
    } catch (error) {
        console.log('지원권 항목 로드 실패:', error);
    }
    
    updateVoucherSelect();
}

// 지원권 선택 옵션 업데이트
function updateVoucherSelect() {
    const select = document.getElementById('voucherSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">지원권을 선택하세요</option>';
    voucherTypes.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        option.textContent = item.name;
        select.appendChild(option);
    });
}

// 사용자의 이번 달 총 사용 횟수 로드
async function loadUserTotalUsage() {
    if (!currentUser || !spreadsheetId) return 0;
    
    const currentMonth = getCurrentMonth();
    let totalUsage = 0;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권사용', 'A:D');
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const month = row[0] || '';
                const uid = row[1] || '';
                
                if (month === currentMonth && uid === currentUser.uid) {
                    totalUsage++;
                }
            }
        }
    } catch (error) {
        console.log('지원권 사용 현황 로드 실패:', error);
    }
    
    return totalUsage;
}

// 지원권 현황 표시
export async function displayVoucherStatus() {
    const container = document.getElementById('voucherStatus');
    if (!container || !currentUser) return;
    
    await loadUserBonusCount();
    
    const totalMax = maxVoucherCount + userBonusCount;
    const used = await loadUserTotalUsage();
    const remaining = totalMax - used;
    const percentage = (used / totalMax) * 100;
    const isExhausted = remaining <= 0;
    
    // 최대 횟수 표시 (기본 + 추가)
    const maxDisplay = userBonusCount > 0 
        ? `${maxVoucherCount} <span class="bonus-count">+${userBonusCount}</span>`
        : `${maxVoucherCount}`;
    
    container.innerHTML = `
        <div class="voucher-status-card ${isExhausted ? 'exhausted' : ''}">
            <div class="voucher-status-label">이번 달 남은 횟수</div>
            <div class="voucher-status-count">
                <span class="remaining">${remaining}</span>
                <span class="separator">/</span>
                <span class="max">${maxDisplay}</span>
            </div>
            <div class="voucher-progress">
                <div class="voucher-progress-bar" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
    
    // 버튼 상태 업데이트
    const useBtn = document.getElementById('useVoucherBtn');
    if (useBtn) {
        useBtn.disabled = isExhausted;
        useBtn.textContent = isExhausted ? '이번 달 사용 완료' : '지원권 사용';
    }
}

// 지원권 사용
async function useVoucher() {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }
    
    const select = document.getElementById('voucherSelect');
    const voucherName = select?.value;
    
    if (!voucherName) {
        alert('지원권을 선택해주세요.');
        return;
    }
    
    // 남은 횟수 확인
    await loadUserBonusCount();
    const totalMax = maxVoucherCount + userBonusCount;
    const used = await loadUserTotalUsage();
    const remaining = totalMax - used;
    
    if (remaining <= 0) {
        alert('이번 달 사용 가능 횟수를 모두 소진했습니다.');
        return;
    }
    
    if (!confirm(`"${voucherName}" 지원권을 사용하시겠습니까?\n남은 횟수: ${remaining - 1}/${totalMax}`)) {
        return;
    }
    
    try {
        const now = getKoreaTime();
        const currentMonth = getCurrentMonth();
        
        await saveToGoogleSheetWithId(spreadsheetId, '지원권사용', [
            currentMonth,
            currentUser.uid,
            voucherName,
            formatDate(now) + ' ' + formatTime(now)
        ], ['월', '고유번호', '지원권명', '사용일시']);
        
        alert(`"${voucherName}" 지원권을 사용했습니다.`);
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        
        // 지원권 상태 및 내역 새로고침
        await loadVoucherSettings();
        await loadVoucherTypes();
        displayVoucherStatus();
        loadVoucherHistory();
        
    } catch (error) {
        console.error('지원권 사용 실패:', error);
        alert('지원권 사용에 실패했습니다.');
    }
}

// 사용 내역 로드
export async function loadVoucherHistory() {
    const container = document.getElementById('voucherHistory');
    if (!container || !currentUser) return;
    
    const currentMonth = getCurrentMonth();
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권사용', 'A:D');
        const history = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const month = row[0] || '';
                const uid = row[1] || '';
                const voucherName = row[2] || '';
                const usedAt = row[3] || '';
                
                if (month === currentMonth && uid === currentUser.uid) {
                    history.push({ voucherName, usedAt });
                }
            }
        }
        
        if (history.length === 0) {
            container.innerHTML = '<p class="no-records">이번 달 사용 내역이 없습니다.</p>';
            return;
        }
        
        // 최신순 정렬
        history.reverse();
        
        container.innerHTML = history.map(item => `
            <div class="voucher-history-item">
                <span class="voucher-history-name">${item.voucherName}</span>
                <span class="voucher-history-date">${item.usedAt}</span>
            </div>
        `).join('');
        
    } catch (error) {
        console.log('사용 내역 로드 실패:', error);
        container.innerHTML = '<p class="no-records">사용 내역을 불러올 수 없습니다.</p>';
    }
}

// 관리자용: 현재 최대 횟수 표시
async function displayCurrentMax() {
    const span = document.getElementById('currentVoucherMax');
    if (span) {
        span.textContent = maxVoucherCount;
    }
    
    const input = document.getElementById('voucherMaxCount');
    if (input) {
        input.placeholder = maxVoucherCount;
    }
}

// 관리자용: 최대 횟수 저장
async function saveVoucherMax() {
    const input = document.getElementById('voucherMaxCount');
    const newMax = parseInt(input?.value);
    
    if (!newMax || newMax < 1) {
        alert('1 이상의 숫자를 입력해주세요.');
        return;
    }
    
    try {
        // 기존 설정 확인
        let existingRow = -1;
        try {
            const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권설정', 'A:B');
            if (rows && rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    if (rows[i][0] === '최대횟수') {
                        existingRow = i + 1;
                        break;
                    }
                }
            }
        } catch (e) {
            // 시트가 없을 수 있음
        }
        
        if (existingRow > 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '지원권설정', `A${existingRow}:B${existingRow}`, [['최대횟수', newMax.toString()]]);
        } else {
            await saveToGoogleSheetWithId(spreadsheetId, '지원권설정', ['최대횟수', newMax.toString()], ['설정명', '값']);
        }
        
        maxVoucherCount = newMax;
        alert(`월 최대 사용 횟수가 ${newMax}회로 설정되었습니다.`);
        input.value = '';
        displayCurrentMax();
        displayVoucherStatus();
        
    } catch (error) {
        console.error('최대 횟수 저장 실패:', error);
        alert('저장에 실패했습니다.');
    }
}

// 관리자용 지원권 항목 목록 로드
export async function loadVoucherTypesList() {
    const container = document.getElementById('voucherTypesList');
    if (!container) return;
    
    if (!spreadsheetId) {
        container.innerHTML = '<p>시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권항목', 'A:A');
        const types = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    types.push({
                        name: rows[i][0],
                        rowIndex: i + 1
                    });
                }
            }
        }
        
        if (types.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">등록된 지원권 항목이 없습니다.</p>';
            return;
        }
        
        container.innerHTML = types.map(type => `
            <div class="item-row">
                <span>${type.name}</span>
                <button class="btn btn-danger btn-sm" onclick="deleteVoucherType(${type.rowIndex}, '${type.name}')">삭제</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('지원권 항목 목록 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--text-secondary);">항목을 불러오는데 실패했습니다.</p>';
    }
}

// 지원권 항목 추가
async function addVoucherType(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('newVoucherName');
    if (!nameInput) {
        console.error('newVoucherName 요소를 찾을 수 없습니다.');
        return;
    }
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('지원권 이름을 입력해주세요.');
        return;
    }
    
    try {
        await saveToGoogleSheetWithId(spreadsheetId, '지원권항목', [name], ['지원권명']);
        
        alert(`"${name}" 지원권이 추가되었습니다.`);
        nameInput.value = '';
        
        await loadVoucherTypes();
        await loadVoucherTypesList();
        
    } catch (error) {
        console.error('지원권 항목 추가 실패:', error);
        alert('지원권 추가에 실패했습니다.');
    }
}

// 지원권 항목 삭제
window.deleteVoucherType = async function(rowIndex, name) {
    if (!confirm(`"${name}" 지원권을 삭제하시겠습니까?`)) return;
    
    try {
        await deleteRowFromGoogleSheetWithId(spreadsheetId, '지원권항목', rowIndex);
        
        alert(`"${name}" 지원권이 삭제되었습니다.`);
        await loadVoucherTypes();
        await loadVoucherTypesList();
        
    } catch (error) {
        console.error('지원권 항목 삭제 실패:', error);
        alert('삭제에 실패했습니다.');
    }
};

// 관리자용: 추가 횟수 부여
async function addBonusVoucher(e) {
    e.preventDefault();
    
    const uidInput = document.getElementById('bonusVoucherUid');
    const countInput = document.getElementById('bonusVoucherCount');
    
    if (!uidInput || !countInput) return;
    
    const uid = uidInput.value.trim();
    const count = parseInt(countInput.value);
    
    if (!uid) {
        alert('고유번호를 입력해주세요.');
        return;
    }
    
    if (!count || count < 1) {
        alert('1 이상의 횟수를 입력해주세요.');
        return;
    }
    
    try {
        const now = getKoreaTime();
        const currentMonth = getCurrentMonth();
        
        await saveToGoogleSheetWithId(spreadsheetId, '지원권추가', [
            currentMonth,
            uid,
            count.toString(),
            formatDate(now) + ' ' + formatTime(now)
        ], ['월', '고유번호', '추가횟수', '부여일시']);
        
        alert(`${uid}님에게 추가 ${count}회가 부여되었습니다.`);
        uidInput.value = '';
        countInput.value = '';
        
        // 현재 주로 설정 (방금 부여한 항목이 현재 주에 있음)
        selectedWeek = getWeek(getKoreaTime());
        await loadBonusVoucherList();
        
    } catch (error) {
        console.error('추가 횟수 부여 실패:', error);
        alert('부여에 실패했습니다.');
    }
}

// 관리자용: 추가 횟수 목록 로드 (주별)
async function loadBonusVoucherList() {
    const container = document.getElementById('bonusVoucherList');
    if (!container) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '지원권추가', 'A:D');
        const bonusList = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const grantedAt = row[3] || '';
                
                if (!grantedAt || !row[1]) continue;
                
                // 날짜 파싱 (YYYY-MM-DD HH:mm:ss 형식)
                const dateStr = grantedAt.split(' ')[0];
                if (!dateStr) continue;
                
                const [year, month, day] = dateStr.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                const itemWeek = getWeek(date);
                
                // 선택된 주와 일치하는 항목만
                if (itemWeek === selectedWeek) {
                    bonusList.push({
                        rowIndex: i + 1,
                        uid: row[1] || '',
                        count: row[2] || '0',
                        grantedAt: grantedAt,
                        week: itemWeek
                    });
                }
            }
        }
        
        // 주 표시 및 네비게이션
        const weekDisplay = document.getElementById('bonusVoucherWeekDisplay');
        if (weekDisplay) {
            weekDisplay.innerHTML = `
                <div class="week-navigation">
                    <button class="btn btn-sm btn-secondary" onclick="navigateBonusWeek('prev')" title="이전 주">←</button>
                    <span class="week-label">${formatWeek(selectedWeek)}</span>
                    <button class="btn btn-sm btn-secondary" onclick="navigateBonusWeek('next')" title="다음 주">→</button>
                </div>
            `;
        }
        
        if (bonusList.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">이 주에 추가 부여 내역이 없습니다.</p>';
            return;
        }
        
        container.innerHTML = bonusList.map(item => `
            <div class="item-row">
                <span><strong>${item.uid}</strong> +${item.count}회 (${item.grantedAt})</span>
                <button class="btn btn-danger btn-sm" onclick="deleteBonusVoucher(${item.rowIndex}, '${item.uid}')">취소</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.log('추가 횟수 목록 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">목록을 불러올 수 없습니다.</p>';
    }
}

// 주 네비게이션
window.navigateBonusWeek = function(direction) {
    if (direction === 'prev') {
        selectedWeek = getPreviousWeek(selectedWeek);
    } else if (direction === 'next') {
        selectedWeek = getNextWeek(selectedWeek);
    }
    loadBonusVoucherList();
};

// 추가 횟수 취소
window.deleteBonusVoucher = async function(rowIndex, uid) {
    if (!confirm(`${uid}님의 추가 횟수 부여를 취소하시겠습니까?`)) return;
    
    try {
        await deleteRowFromGoogleSheetWithId(spreadsheetId, '지원권추가', rowIndex);
        alert('추가 횟수가 취소되었습니다.');
        await loadBonusVoucherList();
    } catch (error) {
        console.error('추가 횟수 취소 실패:', error);
        alert('취소에 실패했습니다.');
    }
};

// 지원권 관리 폼 설정
export function setupVoucherAdmin() {
    // 현재 주로 초기화
    selectedWeek = getWeek(getKoreaTime());
    
    const form = document.getElementById('addVoucherTypeForm');
    if (form) {
        form.addEventListener('submit', addVoucherType);
    }
    
    const bonusForm = document.getElementById('addBonusVoucherForm');
    if (bonusForm) {
        bonusForm.addEventListener('submit', addBonusVoucher);
    }
    
    const saveMaxBtn = document.getElementById('saveVoucherMaxBtn');
    if (saveMaxBtn) {
        saveMaxBtn.addEventListener('click', saveVoucherMax);
    }
    
    displayCurrentMax();
    loadBonusVoucherList();
}

// 지원권 설정
export function setupVoucher() {
    loadVoucherSettings().then(() => {
        loadVoucherTypes().then(() => {
            displayVoucherStatus();
            loadVoucherHistory();
        });
    });
    
    // 사용 버튼 이벤트
    const useBtn = document.getElementById('useVoucherBtn');
    if (useBtn) {
        useBtn.addEventListener('click', useVoucher);
    }
}
