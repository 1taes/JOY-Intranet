// 검색 관련 함수 모듈
import { spreadsheetId } from './globals.js';
import { batchReadFromGoogleSheetWithId } from './googleSheets.js';

// 검색 기능
export async function performSearch() {
    const statusDiv = document.getElementById('searchStatus');
    const resultsDiv = document.getElementById('searchResults');
    
    const reportType = document.getElementById('searchReportType').value;
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;
    const writerUid = document.getElementById('searchWriterUid').value.trim();
    const item = document.getElementById('searchItem').value.trim();
    const keyword = document.getElementById('searchKeyword').value.trim();
    
    try {
        statusDiv.textContent = '검색 중...';
        statusDiv.className = 'status-message';
        resultsDiv.innerHTML = '';
        
        const allReports = [];
        
        // 구글 시트에서 검색
        if (spreadsheetId) {
            try {
                // 배치로 2개 시트 한 번에 읽기
                const ranges = [];
                if (!reportType || reportType === '거래') {
                    ranges.push({ sheetName: '거래', range: 'A:J' });
                }
                if (!reportType || reportType === 'RP') {
                    ranges.push({ sheetName: 'RP', range: 'A:G' });
                }
                
                if (ranges.length > 0) {
                    const batchData = await batchReadFromGoogleSheetWithId(spreadsheetId, ranges);
                    
                    // 거래보고서 검색
                    if (batchData['거래']) {
                        const rows = batchData['거래'];
                        if (rows && rows.length > 1) {
                            for (let i = 1; i < rows.length; i++) {
                                const row = rows[i];
                                // 거래보고서 구조: 날짜(0), 시간(1), 항목(2), 갯수(3), 금액(4), 공금액(5), 고유번호(6), 이름(7), 내용(8), 작성자고유번호(9)
                                const reportDate = row[0] || '';
                                const reportTime = row[1] || '';
                                const reportItem = row[2] || '';
                                const quantity = row[3] || '';
                                const amount = row[4] || '';
                                const publicDeposit = row[5] || '';
                                const customerId = row[6] || '';
                                const customerName = row[7] || '';
                                const content = row[8] || '';
                                const uid = row[9] || '';
                                
                                // 날짜 필터
                                if (startDate && reportDate < startDate) continue;
                                if (endDate && reportDate > endDate) continue;
                                
                                // 작성자 필터
                                if (writerUid && uid !== writerUid) continue;
                                
                                // 항목 필터
                                if (item && reportItem !== item) continue;
                                
                                // 키워드 필터 (내용, 고객이름, 고객고유번호에서 검색)
                                if (keyword) {
                                    const searchText = (content + ' ' + customerName + ' ' + customerId).toLowerCase();
                                    if (!searchText.includes(keyword.toLowerCase())) continue;
                                }
                                
                                allReports.push({
                                    유형: '거래',
                                    날짜: reportDate,
                                    시간: reportTime,
                                    항목: reportItem,
                                    수량: quantity,
                                    금액: amount,
                                    공금액: publicDeposit,
                                    고객고유번호: customerId,
                                    고객이름: customerName,
                                    내용: content,
                                    작성자고유번호: uid
                                });
                            }
                        }
                    }
                    
                    // RP보고서 검색
                    if (batchData['RP']) {
                        const rows = batchData['RP'];
                        if (rows && rows.length > 1) {
                            for (let i = 1; i < rows.length; i++) {
                                const row = rows[i];
                                // RP보고서 구조: 날짜(0), 시간(1), 항목(2), 개수(3), 금액(4), 특이사항(5), 작성자고유번호(6)
                                const reportDate = row[0] || '';
                                const reportTime = row[1] || '';
                                const reportItem = row[2] || '';
                                const quantity = row[3] || '';
                                const amount = row[4] || '';
                                const content = row[5] || '';
                                const uid = row[6] || '';
                                
                                // 날짜 필터
                                if (startDate && reportDate < startDate) continue;
                                if (endDate && reportDate > endDate) continue;
                                
                                // 작성자 필터
                                if (writerUid && uid !== writerUid) continue;
                                
                                // 항목 필터
                                if (item && reportItem !== item) continue;
                                
                                // RP보고서는 키워드 필터 없음 (내용 필드가 있지만 검색하지 않음)
                                
                                allReports.push({
                                    유형: 'RP',
                                    날짜: reportDate,
                                    시간: reportTime,
                                    항목: reportItem,
                                    개수: quantity,
                                    금액: amount,
                                    작성자고유번호: uid
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.log('검색 실패:', error);
            }
        } else {
            // 시트가 없으면 검색할 수 없음
            allReports = [];
        }
        
        // 결과 정렬 (날짜 내림차순)
        allReports.sort((a, b) => {
            if (a.날짜 > b.날짜) return -1;
            if (a.날짜 < b.날짜) return 1;
            if (a.시간 > b.시간) return -1;
            if (a.시간 < b.시간) return 1;
            return 0;
        });
        
        // 결과 표시
        if (allReports.length === 0) {
            resultsDiv.innerHTML = '<p class="no-records">검색 결과가 없습니다.</p>';
            statusDiv.textContent = '검색 완료 (0건)';
            statusDiv.className = 'status-message';
        } else {
            let html = '<div style="margin-top: 15px;">';
            html += `<h3>검색 결과 (${allReports.length}건)</h3>`;
            html += '<div style="display: grid; gap: 10px; margin-top: 10px;">';
            
            allReports.forEach(report => {
                const typeColor = report.유형 === '거래' ? '#22c55e' : '#f59e0b';
                html += '<div class="search-result-item">';
                html += `<div class="search-result-header" style="color: ${typeColor};">
                    ${report.유형}보고서 - ${report.날짜} ${report.시간 || ''}
                </div>`;
                
                if (report.유형 === '거래') {
                    html += `<div class="search-result-detail"><strong>항목:</strong> ${report.항목 || '-'}</div>`;
                    html += `<div class="search-result-detail"><strong>수량:</strong> ${report.수량 || '-'}</div>`;
                    html += `<div class="search-result-detail"><strong>금액:</strong> ${report.금액 ? parseInt(report.금액.toString().replace(/[^0-9]/g, '')).toLocaleString() + '원' : '-'}</div>`;
                    if (report.공금액 && report.공금액 !== '0' && report.공금액 !== '') {
                        html += `<div class="search-result-detail"><strong>공금액:</strong> <span style="color: #ff9800;">${parseInt(report.공금액.toString().replace(/[^0-9]/g, '')).toLocaleString()}원</span></div>`;
                    }
                    html += `<div class="search-result-detail"><strong>고객고유번호:</strong> ${report.고객고유번호 || '-'}</div>`;
                    if (report.고객이름) {
                        html += `<div class="search-result-detail"><strong>고객이름:</strong> ${report.고객이름}</div>`;
                    }
                    html += `<div class="search-result-detail"><strong>내용:</strong> ${report.내용 || '-'}</div>`;
                    html += `<div class="search-result-detail"><strong>작성자:</strong> ${report.작성자고유번호 || '-'}</div>`;
                } else {
                    html += `<div class="search-result-detail"><strong>항목:</strong> ${report.항목 || '-'}</div>`;
                    html += `<div class="search-result-detail"><strong>개수:</strong> ${report.개수 || '-'}</div>`;
                    if (report.금액 && report.금액 !== '0' && report.금액 !== '') {
                        html += `<div class="search-result-detail"><strong>금액:</strong> ${parseInt(report.금액.toString().replace(/[^0-9]/g, '')).toLocaleString()}원</div>`;
                    }
                    html += `<div class="search-result-detail"><strong>작성자:</strong> ${report.작성자고유번호 || '-'}</div>`;
                }
                
                html += '</div>';
            });
            
            html += '</div></div>';
            resultsDiv.innerHTML = html;
            statusDiv.textContent = `검색 완료 (${allReports.length}건)`;
            statusDiv.className = 'status-message success';
        }
    } catch (error) {
        console.error('검색 실패:', error);
        statusDiv.textContent = `검색 중 오류가 발생했습니다: ${error.message}`;
        statusDiv.className = 'status-message error';
        resultsDiv.innerHTML = '';
    }
}

// 검색 페이지 설정
export function setupSearch() {
    const searchForm = document.getElementById('searchReportForm');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    
    if (searchForm) {
        searchForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await performSearch();
        });
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            document.getElementById('searchReportType').value = '';
            document.getElementById('searchStartDate').value = '';
            document.getElementById('searchEndDate').value = '';
            document.getElementById('searchWriterUid').value = '';
            document.getElementById('searchItem').value = '';
            document.getElementById('searchKeyword').value = '';
            document.getElementById('searchResults').innerHTML = '';
            document.getElementById('searchStatus').textContent = '';
        });
    }
}

