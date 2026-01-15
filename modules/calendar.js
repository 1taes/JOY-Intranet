// 캘린더 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { getKoreaTime, formatDate, showMessage } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, deleteRowFromGoogleSheetWithId } from './googleSheets.js';

// 현재 표시 중인 년월
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// 선택된 날짜
let selectedDate = null;

// 일정 데이터 캐시
let eventsCache = [];

// 캘린더 렌더링
export function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const title = document.getElementById('calendarTitle');
    
    if (!grid || !title) return;
    
    title.textContent = `${currentYear}년 ${currentMonth + 1}월`;
    
    // 해당 월의 첫째 날과 마지막 날
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0=일요일
    const daysInMonth = lastDay.getDate();
    
    // 요일 헤더
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    let html = '<div class="calendar-row calendar-header-row">';
    dayNames.forEach((day, index) => {
        const className = index === 0 ? 'sunday' : (index === 6 ? 'saturday' : '');
        html += `<div class="calendar-cell calendar-day-name ${className}">${day}</div>`;
    });
    html += '</div>';
    
    // 날짜 그리드
    let dayCount = 1;
    const today = formatDate(getKoreaTime());
    
    for (let week = 0; week < 6; week++) {
        if (dayCount > daysInMonth) break;
        
        html += '<div class="calendar-row">';
        
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            if (week === 0 && dayOfWeek < startDayOfWeek) {
                // 이전 달 빈칸
                html += '<div class="calendar-cell empty"></div>';
            } else if (dayCount > daysInMonth) {
                // 다음 달 빈칸
                html += '<div class="calendar-cell empty"></div>';
            } else {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`;
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const dayEvents = eventsCache.filter(e => e.date === dateStr);
                const hasEvents = dayEvents.length > 0;
                const isSunday = dayOfWeek === 0;
                const isSaturday = dayOfWeek === 6;
                
                let cellClass = 'calendar-cell day';
                if (isToday) cellClass += ' today';
                if (isSelected) cellClass += ' selected';
                if (hasEvents) cellClass += ' has-events';
                if (isSunday) cellClass += ' sunday';
                if (isSaturday) cellClass += ' saturday';
                
                // 일정 제목 표시 (최대 2개)
                const eventTitles = dayEvents.slice(0, 2).map(e => e.title);
                const eventTitlesHtml = eventTitles.length > 0 
                    ? `<div class="event-titles">${eventTitles.map(t => `<span class="event-title">${t}</span>`).join('')}</div>`
                    : '';
                
                html += `<div class="${cellClass}" data-date="${dateStr}" onclick="selectDate('${dateStr}')">
                    <span class="day-number">${dayCount}</span>
                    ${eventTitlesHtml}
                    ${dayEvents.length > 2 ? `<span class="event-more">+${dayEvents.length - 2}</span>` : ''}
                </div>`;
                
                dayCount++;
            }
        }
        
        html += '</div>';
    }
    
    grid.innerHTML = html;
}

// 날짜 선택
window.selectDate = function(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    loadEventsForDate(dateStr);
    
    // 일정 추가 폼에 날짜 설정
    const eventDateInput = document.getElementById('eventDate');
    if (eventDateInput) {
        eventDateInput.value = dateStr;
    }
};

// 일정 로드
export async function loadEvents() {
    if (!spreadsheetId) {
        eventsCache = [];
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '일정', 'A:E');
        eventsCache = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row[0]) {
                    eventsCache.push({
                        rowIndex: i + 1,
                        date: row[0],
                        title: row[1] || '',
                        description: row[2] || '',
                        createdBy: row[3] || '',
                        createdAt: row[4] || ''
                    });
                }
            }
        }
    } catch (error) {
        console.log('일정 로드 실패:', error);
        eventsCache = [];
    }
    
    renderCalendar();
}

// 오늘 일정 가져오기 (홈용)
export async function getTodayEvents() {
    if (!spreadsheetId) return [];
    
    // 캐시가 비어있으면 로드
    if (eventsCache.length === 0) {
        try {
            const rows = await readFromGoogleSheetWithId(spreadsheetId, '일정', 'A:E');
            eventsCache = [];
            
            if (rows && rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row[0]) {
                        eventsCache.push({
                            rowIndex: i + 1,
                            date: row[0],
                            title: row[1] || '',
                            description: row[2] || '',
                            createdBy: row[3] || '',
                            createdAt: row[4] || ''
                        });
                    }
                }
            }
        } catch (error) {
            console.log('일정 로드 실패:', error);
            return [];
        }
    }
    
    const today = formatDate(getKoreaTime());
    return eventsCache.filter(e => e.date === today);
}

// 특정 날짜의 일정 표시
function loadEventsForDate(dateStr) {
    const display = document.getElementById('selectedDateDisplay');
    const list = document.getElementById('eventsList');
    
    if (display) {
        display.textContent = dateStr;
    }
    
    if (!list) return;
    
    const events = eventsCache.filter(e => e.date === dateStr);
    
    if (events.length === 0) {
        list.innerHTML = '<p class="no-records">이 날짜에 등록된 일정이 없습니다.</p>';
        return;
    }
    
    const canDelete = currentUser?.isAdmin || currentUser?.role >= 1; // 간부직 이상
    
    list.innerHTML = events.map(event => `
        <div class="event-item">
            <div class="event-header">
                <strong>${event.title}</strong>
                ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteEvent(${event.rowIndex})">삭제</button>` : ''}
            </div>
            ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
            <small class="event-meta">작성자: ${event.createdBy} | ${event.createdAt}</small>
        </div>
    `).join('');
}

// 일정 추가
async function addEvent(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showMessage('eventStatus', '로그인이 필요합니다.', 'error');
        return;
    }
    
    const form = document.getElementById('eventForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    const date = document.getElementById('eventDate').value;
    const title = document.getElementById('eventTitle').value.trim();
    const description = document.getElementById('eventDescription').value.trim();
    
    if (!date || !title) {
        showMessage('eventStatus', '날짜와 제목은 필수입니다.', 'error');
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = '추가 중...';
    
    try {
        if (spreadsheetId) {
            const now = getKoreaTime();
            await saveToGoogleSheetWithId(spreadsheetId, '일정', [
                date,
                title,
                description,
                currentUser.uid,
                formatDate(now) + ' ' + now.toTimeString().slice(0, 8)
            ], ['날짜', '제목', '내용', '작성자', '작성일시']);
        }
        
        showMessage('eventStatus', '일정이 추가되었습니다.', 'success');
        form.reset();
        
        await loadEvents();
        renderCalendar();
        if (selectedDate) {
            loadEventsForDate(selectedDate);
        }
    } catch (error) {
        console.error('일정 추가 실패:', error);
        showMessage('eventStatus', '일정 추가에 실패했습니다.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '일정 추가';
    }
}

// 일정 삭제
window.deleteEvent = async function(rowIndex) {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '일정', rowIndex);
        }
        
        await loadEvents();
        renderCalendar();
        if (selectedDate) {
            loadEventsForDate(selectedDate);
        }
    } catch (error) {
        console.error('일정 삭제 실패:', error);
        alert('삭제 중 오류가 발생했습니다.');
    }
};

// 캘린더 설정
export function setupCalendar() {
    // 이전/다음 달 버튼
    const prevBtn = document.getElementById('calendarPrevMonth');
    const nextBtn = document.getElementById('calendarNextMonth');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
    }
    
    // 일정 추가 폼
    const form = document.getElementById('eventForm');
    if (form) {
        form.addEventListener('submit', addEvent);
    }
    
    // 오늘 날짜로 초기화
    const today = getKoreaTime();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
    selectedDate = formatDate(today);
    
    document.getElementById('eventDate').value = selectedDate;
    
    // 일정 로드 및 캘린더 렌더링
    loadEvents();
}

