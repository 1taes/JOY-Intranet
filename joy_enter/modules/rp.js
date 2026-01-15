// RP보고서 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate, formatTime, showMessage } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, writeToGoogleSheetWithId, deleteRowFromGoogleSheetWithId, createSheetIfNotExistsWithId } from './googleSheets.js';

// RP 항목 목록 {항목명: 금액}
let rpItems = {};

// 현재 조회 날짜
let rpCurrentDate = new Date();

// RP 항목 로드
export async function loadRpItems() {
    if (!spreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, 'RP항목', 'A:B');
        if (rows && rows.length > 1) {
            rpItems = {};
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    const name = rows[i][0];
                    const price = parseFloat(rows[i][1]) || 0;
                    rpItems[name] = price;
                }
            }
        }
    } catch (error) {
        console.log('RP 항목 로드 실패, 기본값 사용:', error);
    }
    
    updateRpItemOptions();
}

// RP 항목 옵션 업데이트
function updateRpItemOptions() {
    const select = document.getElementById('rpItem');
    if (!select) return;
    
    select.innerHTML = '<option value="">항목을 선택하세요</option>';
    Object.keys(rpItems).forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        const price = rpItems[item] || 0;
        option.textContent = `${item}${price > 0 ? ` (${price.toLocaleString()}원)` : ''}`;
        option.dataset.price = price;
        select.appendChild(option);
    });
    
    // 금액 자동 계산
    updateRpAmount();
}

// RP 금액 자동 계산
function updateRpAmount() {
    const itemSelect = document.getElementById('rpItem');
    const countSelect = document.getElementById('rpCount');
    const amountInput = document.getElementById('rpAmount');
    
    if (!itemSelect || !countSelect || !amountInput) return;
    
    const selectedOption = itemSelect.selectedOptions[0];
    const price = parseFloat(selectedOption?.dataset?.price) || 0;
    const count = parseInt(countSelect?.value) || 1;
    const totalAmount = price * count;
    
    amountInput.value = totalAmount > 0 ? totalAmount.toLocaleString() + '원' : '';
}

// RP 항목 목록 로드 (관리자용)
export async function loadRpItemsList() {
    const container = document.getElementById('rpItemsList');
    if (!container) return;
    
    if (!spreadsheetId) {
        container.innerHTML = '<p>시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, 'RP항목', 'A:B');
        const items = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    items.push({
                        name: rows[i][0],
                        price: parseFloat(rows[i][1]) || 0,
                        rowIndex: i + 1
                    });
                }
            }
        }
        
        if (items.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">등록된 항목이 없습니다. 항목을 추가해주세요.</p>';
            return;
        }
        
        container.innerHTML = items.map(item => `
            <div class="item-row">
                <div class="item-info">
                    <strong>${item.name}</strong>
                    <span class="item-details">금액: ${item.price.toLocaleString()}원</span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteRpItem(${item.rowIndex}, '${item.name}')">삭제</button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('RP 항목 목록 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--text-secondary);">항목 목록이 없습니다. 항목을 추가해주세요.</p>';
    }
}

// RP 항목 저장
export async function saveRpItems() {
    if (!spreadsheetId) return;
    
    try {
        await createSheetIfNotExistsWithId(spreadsheetId, 'RP항목');
        
        let rows;
        try {
            rows = await readFromGoogleSheetWithId(spreadsheetId, 'RP항목', 'A:B');
        } catch (e) {
            rows = [];
        }
        
        // 헤더 쓰기
        if (!rows || rows.length === 0) {
            await writeToGoogleSheetWithId(spreadsheetId, 'RP항목', 'A1:B1', [['항목명', '금액']]);
        } else if (rows[0][0] !== '항목명') {
            await writeToGoogleSheetWithId(spreadsheetId, 'RP항목', 'A1:B1', [['항목명', '금액']]);
        }
        
        // 기존 데이터 클리어
        if (rows && rows.length > 1) {
            const clearRange = `A2:B${rows.length}`;
            await writeToGoogleSheetWithId(spreadsheetId, 'RP항목', clearRange, Array(rows.length - 1).fill(['', '']));
        }
        
        // 새 데이터 쓰기
        const itemRows = Object.entries(rpItems).map(([name, price]) => {
            return [name, price.toString()];
        });
        
        if (itemRows.length > 0) {
            await writeToGoogleSheetWithId(spreadsheetId, 'RP항목', 'A2:B' + (itemRows.length + 1), itemRows);
        }
    } catch (error) {
        console.error('RP 항목 저장 실패:', error);
        throw error;
    }
}

// RP 항목 추가
async function addRpItem(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('newRpItemName');
    const priceInput = document.getElementById('newRpItemPrice');
    const name = nameInput.value.trim();
    const price = parseFloat(priceInput?.value) || 0;
    
    if (!name) {
        alert('항목 이름을 입력해주세요.');
        return;
    }
    
    if (price < 0) {
        alert('금액은 0 이상이어야 합니다.');
        return;
    }
    
    try {
        rpItems[name] = price;
        await saveRpItems();
        
        alert(`"${name}" 항목이 추가되었습니다.`);
        nameInput.value = '';
        priceInput.value = '';
        
        await loadRpItems();
        await loadRpItemsList();
        
    } catch (error) {
        console.error('RP 항목 추가 실패:', error);
        alert('항목 추가에 실패했습니다.');
    }
}

// RP 항목 삭제
window.deleteRpItem = async function(rowIndex, name) {
    if (!confirm(`"${name}" 항목을 삭제하시겠습니까?`)) return;
    
    try {
        delete rpItems[name];
        await saveRpItems();
        
        await loadRpItems();
        await loadRpItemsList();
        
        alert(`"${name}" 항목이 삭제되었습니다.`);
        location.reload();
    } catch (error) {
        console.error('RP 항목 삭제 실패:', error);
        alert('항목 삭제에 실패했습니다.');
    }
};

// RP 항목 추가 폼 설정
export function setupRpItemsAdmin() {
    const form = document.getElementById('addRpItemForm');
    if (form) {
        form.addEventListener('submit', addRpItem);
    }
}

// RP보고서 저장
async function saveRpReport(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showMessage('rpStatus', '로그인이 필요합니다.', 'error');
        return;
    }
    
    const form = document.getElementById('rpForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (submitBtn.disabled) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';
    
    const reportDate = formatDate(getKoreaTime());
    const reportTime = formatTime(getKoreaTime());
    const rpItem = document.getElementById('rpItem').value;
    const rpCount = parseInt(document.getElementById('rpCount').value) || 1;
    const rpContent = document.getElementById('rpContent').value.trim();
    const itemPrice = rpItems[rpItem] || 0;
    
    if (!rpItem) {
        showMessage('rpStatus', '항목을 선택해주세요.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'RP보고서 저장';
        return;
    }
    
    try {
        if (spreadsheetId) {
            // 선택한 개수만큼 반복해서 저장 (각 건마다 개별 금액 저장)
            for (let i = 0; i < rpCount; i++) {
                await saveToGoogleSheetWithId(spreadsheetId, 'RP', [
                    reportDate,
                    reportTime,
                    rpItem,
                    '1', // 개수는 각 건마다 1
                    itemPrice.toString(), // 개별 금액
                    rpContent,
                    currentUser.uid
                ], ['날짜', '시간', '항목', '개수', '금액', '특이사항', '작성자고유번호']);
            }
        }
        
        const countText = rpCount > 1 ? ` (${rpCount}건)` : '';
        showMessage('rpStatus', `RP보고서가 저장되었습니다.${countText}`, 'success');
        form.reset();
        document.getElementById('rpDate').value = formatDate(getKoreaTime());
        document.getElementById('rpCount').value = '1';
        document.getElementById('rpAmount').value = '';
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadRpRecords();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('RP보고서 저장 실패:', error);
        showMessage('rpStatus', '저장 중 오류가 발생했습니다.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'RP보고서 저장';
    }
}

// RP보고서 기록 로드
export async function loadRpRecords() {
    if (!currentUser) return;
    
    const dateStr = formatDate(rpCurrentDate);
    const dateDisplay = document.getElementById('rpCurrentDate');
    const recordsList = document.getElementById('rpRecordsList');
    
    if (dateDisplay) dateDisplay.textContent = dateStr;
    if (!recordsList) return;
    
    const today = formatDate(getKoreaTime());
    const isToday = dateStr === today;
    
    try {
        const records = [];
        
        if (spreadsheetId) {
            const rows = await readFromGoogleSheetWithId(spreadsheetId, 'RP', 'A:G');
            
            if (rows && rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 7) continue;
                    
                    const reportDate = row[0] || '';
                    const reportTime = row[1] || '';
                    const item = row[2] || '';
                    const count = row[3] || '1';
                    const amount = row[4] || '0';
                    const content = row[5] || '';
                    const writerUid = row[6] || '';
                    
                    if (reportDate === dateStr && writerUid === currentUser.uid) {
                        records.push({
                            rowIndex: i + 1,
                            date: reportDate,
                            time: reportTime,
                            item,
                            count,
                            amount,
                            content
                        });
                    }
                }
            }
        }
        
        if (records.length === 0) {
            recordsList.innerHTML = '<p class="no-records">이 날짜에 기록된 RP보고서가 없습니다.</p>';
            return;
        }
        
        recordsList.innerHTML = records.map((record, index) => `
            <div class="record-item">
                <div class="record-header">
                    <span class="record-time">${record.time}</span>
                    <span class="record-item-name">${record.item}</span>
                    ${isToday ? `<button class="btn btn-danger btn-sm" onclick="deleteRpRecord(${record.rowIndex}, ${index})">삭제</button>` : ''}
                </div>
                <div class="record-details">
                    <span>개수: ${record.count}</span>
                    <span>금액: ${parseInt(record.amount).toLocaleString()}원</span>
                </div>
                ${record.content ? `<div class="record-content">${record.content}</div>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('RP보고서 로드 실패:', error);
        recordsList.innerHTML = '<p class="error-message">기록을 불러오는데 실패했습니다.</p>';
    }
}

// RP보고서 삭제
window.deleteRpRecord = async function(rowIndex, displayIndex) {
    if (!confirm('이 RP보고서를 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, 'RP', rowIndex);
        }
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadRpRecords();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('RP보고서 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// RP보고서 설정
export function setupRp() {
    // 날짜 초기화
    const dateInput = document.getElementById('rpDate');
    if (dateInput) {
        dateInput.value = formatDate(getKoreaTime());
    }
    
    // 항목 선택 및 개수 변경 시 금액 자동 계산
    const itemSelect = document.getElementById('rpItem');
    const countSelect = document.getElementById('rpCount');
    
    if (itemSelect) {
        itemSelect.addEventListener('change', updateRpAmount);
    }
    if (countSelect) {
        countSelect.addEventListener('change', updateRpAmount);
    }
    
    // 폼 제출
    const form = document.getElementById('rpForm');
    if (form) {
        form.addEventListener('submit', saveRpReport);
    }
    
    // 날짜 네비게이션
    const prevBtn = document.getElementById('rpPrevDate');
    const nextBtn = document.getElementById('rpNextDate');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            rpCurrentDate.setDate(rpCurrentDate.getDate() - 1);
            loadRpRecords();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            rpCurrentDate.setDate(rpCurrentDate.getDate() + 1);
            loadRpRecords();
        });
    }
    
    // 항목 로드 및 기록 로드
    loadRpItems();
    loadRpRecords();
}
