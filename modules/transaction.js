// 거래보고서 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate, formatTime, showMessage } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, writeToGoogleSheetWithId, deleteRowFromGoogleSheetWithId, createSheetIfNotExistsWithId } from './googleSheets.js';

// 거래 항목 목록 {항목명: {금액, 공금입금, limit}}
let transactionItems = {};

// 현재 조회 날짜
let transactionCurrentDate = new Date();

// 거래 항목 로드
export async function loadTransactionItems() {
    if (!spreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '거래항목', 'A:D');
        if (rows && rows.length > 1) {
            transactionItems = {};
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    const name = rows[i][0];
                    const price = parseFloat(rows[i][1]) || 0;
                    const publicDeposit = parseFloat(rows[i][2]) || 0;
                    const limit = parseInt(rows[i][3]) || 0;
                    transactionItems[name] = { 금액: price, 공금입금: publicDeposit, limit: limit };
                }
            }
        }
    } catch (error) {
        console.log('거래 항목 로드 실패:', error);
    }
    
    updateTransactionItemOptions();
}

// 거래 항목 옵션 업데이트
export function updateTransactionItemOptions() {
    const select = document.getElementById('transactionItem');
    if (!select) return;
    
    select.innerHTML = '<option value="">항목을 선택하세요</option>';
    Object.keys(transactionItems).forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        const itemInfo = transactionItems[item];
        option.textContent = `${item} (${itemInfo.금액.toLocaleString()}원)`;
        option.dataset.price = itemInfo.금액;
        option.dataset.publicDeposit = itemInfo.공금입금;
        option.dataset.limit = itemInfo.limit || 0;
        select.appendChild(option);
    });
}

// 거래 항목 저장
export async function saveTransactionItems() {
    if (!spreadsheetId) return;
    
    try {
        await createSheetIfNotExistsWithId(spreadsheetId, '거래항목');
        
        // 기존 데이터 읽어서 행 수 확인
        let rows;
        try {
            rows = await readFromGoogleSheetWithId(spreadsheetId, '거래항목', 'A:D');
        } catch (e) {
            rows = [];
        }
        
        // 헤더 쓰기
        if (!rows || rows.length === 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '거래항목', 'A1:D1', [['항목명', '금액', '공금입금', '개수제한']]);
        } else if (rows[0][0] !== '항목명') {
            await writeToGoogleSheetWithId(spreadsheetId, '거래항목', 'A1:D1', [['항목명', '금액', '공금입금', '개수제한']]);
        }
        
        // 기존 데이터 클리어 (헤더 제외)
        if (rows && rows.length > 1) {
            const clearRange = `A2:D${rows.length}`;
            await writeToGoogleSheetWithId(spreadsheetId, '거래항목', clearRange, Array(rows.length - 1).fill(['', '', '', '']));
        }
        
        // 새 데이터 쓰기
        const itemRows = Object.entries(transactionItems).map(([name, info]) => {
            return [name, info.금액.toString(), info.공금입금.toString(), (info.limit || 0).toString()];
        });
        
        if (itemRows.length > 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '거래항목', 'A2:D' + (itemRows.length + 1), itemRows);
        }
    } catch (error) {
        console.error('거래 항목 저장 실패:', error);
        throw error;
    }
}

// 거래 항목 목록 표시 (관리자용)
export function displayTransactionItems() {
    const listContainer = document.getElementById('transactionItemsList');
    if (!listContainer) return;
    
    const items = Object.keys(transactionItems);
    if (items.length === 0) {
        listContainer.innerHTML = '<p style="color: var(--text-secondary);">등록된 거래 항목이 없습니다.</p>';
        return;
    }
    
    listContainer.innerHTML = items.map(item => {
        const itemInfo = transactionItems[item];
        return `
            <div class="item-row">
                <div class="item-info">
                    <strong>${item}</strong>
                    <span class="item-details">
                        금액: ${itemInfo.금액.toLocaleString()}원 | 
                        공금입금: ${itemInfo.공금입금.toLocaleString()}원 | 
                        제한: ${itemInfo.limit > 0 ? itemInfo.limit + '개' : '무제한'}
                    </span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="window.removeTransactionItem('${item}')">삭제</button>
            </div>
        `;
    }).join('');
}

// 거래 항목 삭제 (전역 함수)
window.removeTransactionItem = async function(itemName) {
    if (!confirm(`"${itemName}" 항목을 삭제하시겠습니까?`)) return;
    
    try {
        delete transactionItems[itemName];
        await saveTransactionItems();
        updateTransactionItemOptions();
        displayTransactionItems();
        showMessage('transactionItemsStatus', '거래 항목이 삭제되었습니다.', 'success');
    } catch (error) {
        console.error('거래 항목 삭제 실패:', error);
        showMessage('transactionItemsStatus', '삭제에 실패했습니다.', 'error');
    }
};

// 거래보고서 저장
async function saveTransactionReport(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showMessage('transactionStatus', '로그인이 필요합니다.', 'error');
        return;
    }
    
    const form = document.getElementById('transactionForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (submitBtn.disabled) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';
    
    const reportDate = formatDate(getKoreaTime());
    const reportTime = formatTime(getKoreaTime());
    const item = document.getElementById('transactionItem').value;
    const quantity = parseInt(document.getElementById('transactionQuantity').value) || 1;
    const amount = document.getElementById('transactionAmount').value;
    const publicDeposit = document.getElementById('transactionPublicDeposit').value;
    const customerId = document.getElementById('transactionCustomerId').value.trim();
    const customerName = document.getElementById('transactionCustomerName').value.trim();
    const content = document.getElementById('transactionContent').value.trim();
    
    if (!item || !customerId) {
        showMessage('transactionStatus', '항목과 고유번호는 필수입니다.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '거래보고서 저장';
        return;
    }
    
    // 개수제한 확인
    const itemInfo = transactionItems[item];
    if (itemInfo && itemInfo.limit > 0) {
        const todayCount = await getTodayTransactionCount(customerId, item, reportDate);
        if (todayCount + quantity > itemInfo.limit) {
            showMessage('transactionStatus', `이 고객은 오늘 "${item}" 항목을 ${itemInfo.limit}개까지만 구매할 수 있습니다. (현재 ${todayCount}개)`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '거래보고서 저장';
            return;
        }
    }
    
    try {
        if (spreadsheetId) {
            await saveToGoogleSheetWithId(spreadsheetId, '거래', [
                reportDate,
                reportTime,
                item,
                quantity.toString(),
                amount,
                publicDeposit,
                customerId,
                customerName,
                content,
                currentUser.uid
            ], ['날짜', '시간', '항목', '갯수', '금액', '공금액', '고유번호', '이름', '내용', '작성자고유번호']);
        }
        
        showMessage('transactionStatus', '거래보고서가 저장되었습니다.', 'success');
        form.reset();
        document.getElementById('transactionDate').value = formatDate(getKoreaTime());
        document.getElementById('transactionQuantity').value = '1';
        document.getElementById('transactionAmount').value = '';
        document.getElementById('transactionPublicDeposit').value = '';
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadTransactionRecords();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('거래보고서 저장 실패:', error);
        showMessage('transactionStatus', '저장 중 오류가 발생했습니다.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '거래보고서 저장';
    }
}

// 오늘 해당 고객의 특정 항목 구매 수량 확인
async function getTodayTransactionCount(customerId, itemName, date) {
    if (!spreadsheetId) return 0;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '거래', 'A:J');
        let count = 0;
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const recordDate = row[0] || '';
                const recordItem = row[2] || '';
                const recordQuantity = parseInt(row[3]) || 1;
                const recordCustomerId = row[6] || '';
                
                if (recordDate === date && recordCustomerId === customerId && recordItem === itemName) {
                    count += recordQuantity;
                }
            }
        }
        
        return count;
    } catch (error) {
        console.log('거래 수량 확인 실패:', error);
        return 0;
    }
}

// 거래보고서 기록 로드
export async function loadTransactionRecords() {
    if (!currentUser) return;
    
    const dateStr = formatDate(transactionCurrentDate);
    const dateDisplay = document.getElementById('transactionCurrentDate');
    const recordsList = document.getElementById('transactionRecordsList');
    
    if (dateDisplay) dateDisplay.textContent = dateStr;
    if (!recordsList) return;
    
    const today = formatDate(getKoreaTime());
    const isToday = dateStr === today;
    
    try {
        const records = [];
        
        if (spreadsheetId) {
            const rows = await readFromGoogleSheetWithId(spreadsheetId, '거래', 'A:J');
            
            if (rows && rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 10) continue;
                    
                    const reportDate = row[0] || '';
                    const reportTime = row[1] || '';
                    const item = row[2] || '';
                    const quantity = row[3] || '1';
                    const amount = row[4] || '';
                    const publicDeposit = row[5] || '';
                    const customerId = row[6] || '';
                    const customerName = row[7] || '';
                    const content = row[8] || '';
                    const writerUid = row[9] || '';
                    
                    if (reportDate === dateStr && writerUid === currentUser.uid) {
                        records.push({
                            rowIndex: i + 1,
                            date: reportDate,
                            time: reportTime,
                            item,
                            quantity,
                            amount,
                            publicDeposit,
                            customerId,
                            customerName,
                            content
                        });
                    }
                }
            }
        }
        
        if (records.length === 0) {
            recordsList.innerHTML = '<p class="no-records">이 날짜에 기록된 거래보고서가 없습니다.</p>';
            return;
        }
        
        recordsList.innerHTML = records.map((record, index) => `
            <div class="record-item">
                <div class="record-header">
                    <span class="record-time">${record.time}</span>
                    <span class="record-item-name">${record.item}</span>
                    ${isToday ? `<button class="btn btn-danger btn-sm" onclick="deleteTransactionRecord(${record.rowIndex}, ${index})">삭제</button>` : ''}
                </div>
                <div class="record-details">
                    <span>수량: ${record.quantity}</span>
                    <span>금액: ${record.amount}</span>
                    <span>공금액: ${record.publicDeposit}</span>
                    <span>고유번호: ${record.customerId}</span>
                    ${record.customerName ? `<span>이름: ${record.customerName}</span>` : ''}
                </div>
                ${record.content ? `<div class="record-content">${record.content}</div>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('거래보고서 로드 실패:', error);
        recordsList.innerHTML = '<p class="error-message">기록을 불러오는데 실패했습니다.</p>';
    }
}

// 거래보고서 삭제
window.deleteTransactionRecord = async function(rowIndex, displayIndex) {
    if (!confirm('이 거래보고서를 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '거래', rowIndex);
        }
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadTransactionRecords();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('거래보고서 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// 관리자용 거래 항목 추가 설정
export function setupTransactionAdmin() {
    const addBtn = document.getElementById('addTransactionItemBtn');
    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const itemInput = document.getElementById('newTransactionItem');
            const amountInput = document.getElementById('newTransactionItemAmount');
            const publicDepositInput = document.getElementById('newTransactionItemPublicDeposit');
            const limitInput = document.getElementById('newTransactionItemLimit');
            
            const itemName = itemInput?.value?.trim();
            const amount = parseFloat(amountInput?.value);
            const publicDeposit = parseFloat(publicDepositInput?.value) || 0;
            const limit = parseInt(limitInput?.value) || 0;
            
            if (!itemName) {
                showMessage('transactionItemsStatus', '항목 이름을 입력해주세요.', 'error');
                return;
            }
            
            if (isNaN(amount) || amount <= 0) {
                showMessage('transactionItemsStatus', '올바른 금액을 입력해주세요.', 'error');
                return;
            }
            
            if (publicDeposit < 0) {
                showMessage('transactionItemsStatus', '공금입금액은 0 이상이어야 합니다.', 'error');
                return;
            }
            
            if (limit < 0) {
                showMessage('transactionItemsStatus', '개수제한은 0 이상이어야 합니다.', 'error');
                return;
            }
            
            if (transactionItems[itemName]) {
                showMessage('transactionItemsStatus', '이미 존재하는 항목입니다.', 'error');
                return;
            }
            
            try {
                transactionItems[itemName] = { 금액: amount, 공금입금: publicDeposit, limit: limit };
                await saveTransactionItems();
                updateTransactionItemOptions();
                displayTransactionItems();
                
                itemInput.value = '';
                amountInput.value = '';
                publicDepositInput.value = '';
                limitInput.value = '';
                
                showMessage('transactionItemsStatus', '거래 항목이 추가되었습니다.', 'success');
            } catch (error) {
                console.error('거래 항목 추가 실패:', error);
                showMessage('transactionItemsStatus', '추가에 실패했습니다.', 'error');
            }
        });
    }
    
    displayTransactionItems();
}

// 거래보고서 설정
export function setupTransaction() {
    // 날짜 초기화
    const dateInput = document.getElementById('transactionDate');
    if (dateInput) {
        dateInput.value = formatDate(getKoreaTime());
    }
    
    // 항목 선택 시 금액 자동 입력
    const itemSelect = document.getElementById('transactionItem');
    const quantityInput = document.getElementById('transactionQuantity');
    const amountInput = document.getElementById('transactionAmount');
    const publicDepositInput = document.getElementById('transactionPublicDeposit');
    
    const updateAmount = () => {
        const selectedOption = itemSelect.selectedOptions[0];
        const price = parseInt(selectedOption?.dataset?.price) || 0;
        const publicDeposit = parseInt(selectedOption?.dataset?.publicDeposit) || 0;
        const quantity = parseInt(quantityInput?.value) || 1;
        const totalAmount = price * quantity;
        const totalPublicDeposit = publicDeposit * quantity;
        
        if (amountInput) {
            amountInput.value = totalAmount > 0 ? totalAmount.toLocaleString() + '원' : '';
        }
        if (publicDepositInput) {
            publicDepositInput.value = totalPublicDeposit > 0 ? totalPublicDeposit.toLocaleString() + '원' : '';
        }
    };
    
    if (itemSelect) itemSelect.addEventListener('change', updateAmount);
    if (quantityInput) quantityInput.addEventListener('input', updateAmount);
    
    // 폼 제출
    const form = document.getElementById('transactionForm');
    if (form) {
        form.addEventListener('submit', saveTransactionReport);
    }
    
    // 날짜 네비게이션
    const prevBtn = document.getElementById('transactionPrevDate');
    const nextBtn = document.getElementById('transactionNextDate');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            transactionCurrentDate.setDate(transactionCurrentDate.getDate() - 1);
            loadTransactionRecords();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            transactionCurrentDate.setDate(transactionCurrentDate.getDate() + 1);
            loadTransactionRecords();
        });
    }
    
    // 항목 로드 및 기록 로드
    loadTransactionItems().then(() => {
        loadTransactionRecords();
    });
}
