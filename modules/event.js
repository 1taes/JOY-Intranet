// 이벤트 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate, formatTime, showMessage } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, writeToGoogleSheetWithId, deleteRowFromGoogleSheetWithId, createSheetIfNotExistsWithId } from './googleSheets.js';

// 이벤트 항목 목록 {항목명: {금액, 개수}}
let eventItems = {};

// 이벤트 항목 로드
export async function loadEventItems() {
    if (!spreadsheetId) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '이벤트항목', 'A:C');
        if (rows && rows.length > 1) {
            eventItems = {};
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0]) {
                    const name = rows[i][0];
                    const price = parseFloat(rows[i][1]) || 0;
                    const quantity = parseInt(rows[i][2]) || 1;
                    eventItems[name] = { 금액: price, 개수: quantity };
                }
            }
        }
    } catch (error) {
        console.log('이벤트 항목 로드 실패:', error);
    }
    
    updateEventItemOptions();
}

// 이벤트 항목 옵션 업데이트
export function updateEventItemOptions() {
    const select = document.getElementById('eventItem');
    if (!select) return;
    
    select.innerHTML = '<option value="">항목을 선택하세요</option>';
    Object.keys(eventItems).forEach(item => {
        const option = document.createElement('option');
        option.value = item;
        const itemInfo = eventItems[item];
        option.textContent = `${item} (${itemInfo.금액.toLocaleString()}원, ${itemInfo.개수}개)`;
        option.dataset.price = itemInfo.금액;
        option.dataset.quantity = itemInfo.개수;
        select.appendChild(option);
    });
}

// 이벤트 항목 저장
export async function saveEventItems() {
    if (!spreadsheetId) return;
    
    try {
        await createSheetIfNotExistsWithId(spreadsheetId, '이벤트항목');
        
        let rows;
        try {
            rows = await readFromGoogleSheetWithId(spreadsheetId, '이벤트항목', 'A:C');
        } catch (e) {
            rows = [];
        }
        
        // 헤더 쓰기
        if (!rows || rows.length === 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '이벤트항목', 'A1:C1', [['항목명', '금액', '개수']]);
        } else if (rows[0][0] !== '항목명') {
            await writeToGoogleSheetWithId(spreadsheetId, '이벤트항목', 'A1:C1', [['항목명', '금액', '개수']]);
        }
        
        // 기존 데이터 클리어
        if (rows && rows.length > 1) {
            const clearRange = `A2:C${rows.length}`;
            await writeToGoogleSheetWithId(spreadsheetId, '이벤트항목', clearRange, Array(rows.length - 1).fill(['', '', '']));
        }
        
        // 새 데이터 쓰기
        const itemRows = Object.entries(eventItems).map(([name, info]) => {
            return [name, info.금액.toString(), info.개수.toString()];
        });
        
        if (itemRows.length > 0) {
            await writeToGoogleSheetWithId(spreadsheetId, '이벤트항목', 'A2:C' + (itemRows.length + 1), itemRows);
        }
    } catch (error) {
        console.error('이벤트 항목 저장 실패:', error);
        throw error;
    }
}

// 관리자용: 이벤트 항목 목록 표시
export function displayEventItems() {
    const container = document.getElementById('eventItemsList');
    if (!container) return;
    
    const items = Object.keys(eventItems);
    if (items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">등록된 이벤트 항목이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const itemInfo = eventItems[item];
        return `
            <div class="item-row">
                <div class="item-info">
                    <strong>${item}</strong>
                    <span class="item-details">
                        금액: ${itemInfo.금액.toLocaleString()}원 | 개수: ${itemInfo.개수}개
                    </span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="window.removeEventItem('${item}')">삭제</button>
            </div>
        `;
    }).join('');
}

// 이벤트 항목 삭제
window.removeEventItem = async function(itemName) {
    if (!confirm(`"${itemName}" 항목을 삭제하시겠습니까?`)) return;
    
    try {
        delete eventItems[itemName];
        await saveEventItems();
        updateEventItemOptions();
        displayEventItems();
        showMessage('eventItemsStatus', '이벤트 항목이 삭제되었습니다.', 'success');
    } catch (error) {
        console.error('이벤트 항목 삭제 실패:', error);
        showMessage('eventItemsStatus', '삭제에 실패했습니다.', 'error');
    }
};

// 이벤트 참여
async function purchaseEvent(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showMessage('eventPurchaseStatus', '로그인이 필요합니다.', 'error');
        return;
    }
    
    const form = document.getElementById('eventPurchaseForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (submitBtn.disabled) return;
    
    submitBtn.disabled = true;
    submitBtn.textContent = '참여 중...';
    
    const item = document.getElementById('eventItem').value;
    const detail = document.getElementById('eventDetail').value.trim();
    
    if (!item) {
        showMessage('eventPurchaseStatus', '항목을 선택해주세요.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '참여';
        return;
    }
    
    const itemInfo = eventItems[item];
    if (!itemInfo) {
        showMessage('eventPurchaseStatus', '선택한 항목을 찾을 수 없습니다.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '참여';
        return;
    }
    
    // 개수는 항목의 기본 개수 사용 (1개)
    const quantity = 1;
    const totalAmount = itemInfo.금액 * quantity;
    
    try {
        const now = getKoreaTime();
        
        await saveToGoogleSheetWithId(spreadsheetId, '이벤트구매', [
            formatDate(now),
            formatTime(now),
            item,
            quantity.toString(),
            totalAmount.toString(),
            detail,
            currentUser.uid
        ], ['날짜', '시간', '항목', '개수', '금액', '상세내역', '구매자']);
        
        showMessage('eventPurchaseStatus', '참여가 완료되었습니다.', 'success');
        form.reset();
        document.getElementById('eventTotalAmount').value = '';
        
        // 상세 내역 기본 템플릿 복원
        const detailInput = document.getElementById('eventDetail');
        if (detailInput) {
            detailInput.value = '기간 : \n\n참가이벤트 :\n\n역할 :';
        }
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadEventHistory();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('이벤트 참여 실패:', error);
        showMessage('eventPurchaseStatus', '참여에 실패했습니다.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '참여';
    }
}

// 참여 내역 로드
export async function loadEventHistory() {
    const container = document.getElementById('eventHistory');
    if (!container || !currentUser) return;
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '이벤트구매', 'A:G');
        const history = [];
        const today = formatDate(getKoreaTime());
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const buyer = row[6] || ''; // 구매자는 G열 (7번째, 인덱스 6)
                
                if (buyer === currentUser.uid) {
                    const recordDate = row[0] || '';
                    history.push({
                        rowIndex: i + 1,
                        date: recordDate,
                        time: row[1] || '',
                        item: row[2] || '',
                        quantity: row[3] || '1',
                        amount: row[4] || '0',
                        detail: row[5] || '', // 상세내역은 F열 (6번째, 인덱스 5)
                        isToday: recordDate === today
                    });
                }
            }
        }
        
        if (history.length === 0) {
            container.innerHTML = '<p class="no-records">참여 내역이 없습니다.</p>';
            return;
        }
        
        // 최신순 정렬
        history.reverse();
        
        container.innerHTML = history.map((item, index) => `
            <div class="record-item">
                <div class="record-header">
                    <span class="record-time">${item.date} ${item.time}</span>
                    <span class="record-item-name">${item.item}</span>
                    ${item.isToday ? `<button class="btn btn-danger btn-sm" onclick="deleteEventRecord(${item.rowIndex}, ${index})">삭제</button>` : ''}
                </div>
                <div class="record-details">
                    <span>금액: ${parseInt(item.amount).toLocaleString()}원</span>
                </div>
                ${item.detail ? `<div class="record-content">${item.detail}</div>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.log('참여 내역 로드 실패:', error);
        container.innerHTML = '<p class="no-records">참여 내역을 불러올 수 없습니다.</p>';
    }
}

// 이벤트 참여 내역 삭제
window.deleteEventRecord = async function(rowIndex, displayIndex) {
    if (!confirm('이 이벤트 참여 내역을 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '이벤트구매', rowIndex);
        }
        
        // 캐시 무효화 후 데이터 다시 로드
        await new Promise(resolve => setTimeout(resolve, 500)); // API 반영 대기
        await loadEventHistory();
        
        // 홈 통계 업데이트
        const { displayWeeklyStats } = await import('./homeStats.js');
        await displayWeeklyStats();
    } catch (error) {
        console.error('이벤트 참여 내역 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// 관리자용: 이벤트 항목 추가 설정
export function setupEventAdmin() {
    const form = document.getElementById('addEventItemForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const nameInput = document.getElementById('newEventItemName');
            const priceInput = document.getElementById('newEventItemPrice');
            const quantityInput = document.getElementById('newEventItemQuantity');
            
            const name = nameInput?.value?.trim();
            const price = parseFloat(priceInput?.value);
            const quantity = parseInt(quantityInput?.value) || 1;
            
            if (!name) {
                showMessage('eventItemsStatus', '항목 이름을 입력해주세요.', 'error');
                return;
            }
            
            if (isNaN(price) || price <= 0) {
                showMessage('eventItemsStatus', '올바른 금액을 입력해주세요.', 'error');
                return;
            }
            
            if (quantity < 1) {
                showMessage('eventItemsStatus', '개수는 1 이상이어야 합니다.', 'error');
                return;
            }
            
            if (eventItems[name]) {
                showMessage('eventItemsStatus', '이미 존재하는 항목입니다.', 'error');
                return;
            }
            
            try {
                eventItems[name] = { 금액: price, 개수: quantity };
                await saveEventItems();
                updateEventItemOptions();
                displayEventItems();
                
                nameInput.value = '';
                priceInput.value = '';
                quantityInput.value = '';
                
                showMessage('eventItemsStatus', '이벤트 항목이 추가되었습니다.', 'success');
            } catch (error) {
                console.error('이벤트 항목 추가 실패:', error);
                showMessage('eventItemsStatus', '추가에 실패했습니다.', 'error');
            }
        });
    }
    
    displayEventItems();
}

// 이벤트 설정
export function setupEvent() {
    // 항목 선택 시 금액 계산 (개수는 항상 1개)
    const itemSelect = document.getElementById('eventItem');
    const amountInput = document.getElementById('eventTotalAmount');
    
    const updateAmount = () => {
        const selectedOption = itemSelect.selectedOptions[0];
        const price = parseFloat(selectedOption?.dataset?.price) || 0;
        const quantity = 1; // 항상 1개
        
        const totalAmount = price * quantity;
        if (amountInput) {
            amountInput.value = totalAmount > 0 ? totalAmount.toLocaleString() + '원' : '';
        }
    };
    
    if (itemSelect) itemSelect.addEventListener('change', updateAmount);
    
    // 참여 폼
    const form = document.getElementById('eventPurchaseForm');
    if (form) {
        form.addEventListener('submit', purchaseEvent);
    }
    
    // 상세 내역 기본 템플릿 설정
    const detailInput = document.getElementById('eventDetail');
    if (detailInput && !detailInput.value) {
        detailInput.value = '기간 : \n\n참가이벤트 :\n\n역할 :';
    }
    
    // 항목 로드 및 내역 로드
    loadEventItems().then(() => {
        loadEventHistory();
    });
}

