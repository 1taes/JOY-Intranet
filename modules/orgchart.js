// 조직도 모듈
import { currentUser, spreadsheetId } from './globals.js';
import { showMessage } from './utils.js';
import { readFromGoogleSheetWithId, saveToGoogleSheetWithId, deleteRowFromGoogleSheetWithId, writeToGoogleSheetWithId } from './googleSheets.js';

// 기본 프로필 이미지
const DEFAULT_PROFILE_IMAGE = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="#cbd5e1">
  <circle cx="50" cy="35" r="20"/>
  <ellipse cx="50" cy="80" rx="30" ry="20"/>
</svg>
`);

// 직급 순서 (정렬용)
const POSITION_ORDER = {
    '고위직': 1,
    '간부직': 2,
    '일반직': 3
};

// 조직도 멤버 캐시
let orgMembers = [];

// 조직도 로드
export async function loadOrgChart() {
    const container = document.getElementById('orgChartContainer');
    if (!container) return;
    
    if (!spreadsheetId) {
        container.innerHTML = '<p class="no-records">시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '조직도', 'A:F');
        orgMembers = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row[0]) {
                    orgMembers.push({
                        rowIndex: i + 1,
                        name: row[0] || '',
                        position: row[1] || '일반직',
                        image: row[2] || '',
                        order: parseInt(row[3]) || 999,
                        uid: row[4] || '',
                        title: row[5] || ''
                    });
                }
            }
        }
        
        renderOrgChart(container);
        
    } catch (error) {
        console.log('조직도 로드 실패:', error);
        container.innerHTML = '<p class="no-records">조직도를 불러오는데 실패했습니다.</p>';
    }
}

// 조직도 렌더링
function renderOrgChart(container) {
    if (orgMembers.length === 0) {
        container.innerHTML = '<p class="no-records">등록된 멤버가 없습니다.</p>';
        return;
    }
    
    // 직책별로 그룹화하고 정렬
    const grouped = {};
    orgMembers.forEach(member => {
        const pos = member.position || '팀원';
        if (!grouped[pos]) grouped[pos] = [];
        grouped[pos].push(member);
    });
    
    // 각 그룹 내에서 order로 정렬
    Object.keys(grouped).forEach(pos => {
        grouped[pos].sort((a, b) => a.order - b.order);
    });
    
    // 직책 순서대로 정렬
    const sortedPositions = Object.keys(grouped).sort((a, b) => {
        return (POSITION_ORDER[a] || 99) - (POSITION_ORDER[b] || 99);
    });
    
    let html = '';
    
    sortedPositions.forEach(position => {
        const members = grouped[position];
        
        html += `
            <div class="org-section">
                <h3 class="org-section-title">${position}</h3>
                <div class="org-members">
                    ${members.map(member => {
                        const isLarge = member.position === '고위직' || member.position === '간부직';
                        return `
                        <div class="org-member-card ${isLarge ? 'large' : ''}">
                            <div class="org-member-image">
                                <img src="${member.image || DEFAULT_PROFILE_IMAGE}" 
                                     alt="${member.name}" 
                                     onerror="this.src='${DEFAULT_PROFILE_IMAGE}'">
                            </div>
                            <div class="org-member-name">${member.name}</div>
                            ${member.title ? `<div class="org-member-title">${member.title}</div>` : ''}
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 관리자용 멤버 목록 로드
export async function loadOrgMembersList() {
    const container = document.getElementById('orgMembersList');
    if (!container) return;
    
    if (!spreadsheetId) {
        container.innerHTML = '<p>시트가 설정되지 않았습니다.</p>';
        return;
    }
    
    try {
        const rows = await readFromGoogleSheetWithId(spreadsheetId, '조직도', 'A:F');
        const members = [];
        
        if (rows && rows.length > 1) {
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row[0]) {
                    members.push({
                        rowIndex: i + 1,
                        name: row[0] || '',
                        position: row[1] || '일반직',
                        image: row[2] || '',
                        order: parseInt(row[3]) || 999,
                        title: row[5] || ''
                    });
                }
            }
        }
        
        if (members.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">등록된 멤버가 없습니다.</p>';
            return;
        }
        
        // 직책 순서, order 순서로 정렬
        members.sort((a, b) => {
            const posOrder = (POSITION_ORDER[a.position] || 99) - (POSITION_ORDER[b.position] || 99);
            if (posOrder !== 0) return posOrder;
            return a.order - b.order;
        });
        
        container.innerHTML = members.map(member => `
            <div class="org-admin-item">
                <div class="org-admin-info">
                    <img src="${member.image || DEFAULT_PROFILE_IMAGE}" 
                         alt="${member.name}" 
                         class="org-admin-thumb"
                         onerror="this.src='${DEFAULT_PROFILE_IMAGE}'">
                    <div>
                        <strong>${member.name}</strong>
                        ${member.title ? `<span class="org-admin-title">${member.title}</span>` : ''}
                        <span class="org-admin-position">${member.position}</span>
                    </div>
                </div>
                <div class="org-admin-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editOrgMember(${member.rowIndex}, '${member.name}', '${member.position}', '${member.image || ''}', ${member.order}, '${member.title || ''}')">수정</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteOrgMember(${member.rowIndex}, '${member.name}')">삭제</button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('조직도 멤버 목록 로드 실패:', error);
        container.innerHTML = '<p style="color: var(--error-color);">목록을 불러오는데 실패했습니다.</p>';
    }
}

// 멤버 추가
async function addOrgMember(e) {
    e.preventDefault();
    
    const name = document.getElementById('orgMemberName').value.trim();
    const position = document.getElementById('orgMemberPosition').value;
    const title = document.getElementById('orgMemberTitle').value.trim();
    const image = document.getElementById('orgMemberImage').value.trim();
    const order = parseInt(document.getElementById('orgMemberOrder').value) || 1;
    
    if (!name || !position) {
        alert('이름과 직급은 필수입니다.');
        return;
    }
    
    try {
        if (spreadsheetId) {
            await saveToGoogleSheetWithId(spreadsheetId, '조직도', [
                name,
                position,
                image,
                order.toString(),
                currentUser?.uid || '',
                title
            ], ['이름', '직급', '이미지URL', '순서', '등록자', '직책']);
        }
        
        alert(`${name}님이 조직도에 추가되었습니다.`);
        document.getElementById('addOrgMemberForm').reset();
        document.getElementById('orgMemberOrder').value = '1';
        
        await loadOrgMembersList();
        await loadOrgChart();
        
    } catch (error) {
        console.error('멤버 추가 실패:', error);
        alert('멤버 추가에 실패했습니다.');
    }
}

// 멤버 수정
window.editOrgMember = async function(rowIndex, name, position, image, order, title) {
    const newName = prompt('이름:', name);
    if (newName === null) return;
    
    const newPosition = prompt('직급 (고위직/간부직/일반직):', position);
    if (newPosition === null) return;
    
    const newTitle = prompt('직책 (예: 대표, 팀장):', title || '');
    if (newTitle === null) return;
    
    const newImage = prompt('이미지 URL (비워두면 기본 이미지):', image);
    if (newImage === null) return;
    
    const newOrder = prompt('순서:', order);
    if (newOrder === null) return;
    
    try {
        if (spreadsheetId) {
            await writeToGoogleSheetWithId(spreadsheetId, '조직도', `A${rowIndex}:F${rowIndex}`, [[
                newName || name,
                newPosition || position,
                newImage || '',
                newOrder || '1',
                currentUser?.uid || '',
                newTitle || ''
            ]]);
        }
        
        alert('멤버 정보가 수정되었습니다.');
        await loadOrgMembersList();
        await loadOrgChart();
        
    } catch (error) {
        console.error('멤버 수정 실패:', error);
        alert('수정에 실패했습니다.');
    }
};

// 멤버 삭제
window.deleteOrgMember = async function(rowIndex, name) {
    if (!confirm(`${name}님을 조직도에서 삭제하시겠습니까?`)) return;
    
    try {
        if (spreadsheetId) {
            await deleteRowFromGoogleSheetWithId(spreadsheetId, '조직도', rowIndex);
        }
        
        alert(`${name}님이 삭제되었습니다.`);
        await loadOrgMembersList();
        await loadOrgChart();
        
    } catch (error) {
        console.error('멤버 삭제 실패:', error);
        alert('삭제에 실패했습니다.');
    }
};

// 조직도 설정
export function setupOrgChart() {
    // 멤버 추가 폼
    const form = document.getElementById('addOrgMemberForm');
    if (form) {
        form.addEventListener('submit', addOrgMember);
    }
    
    // 조직도 로드
    loadOrgChart();
}

