// UI 관련 모듈

// 탭 설정
export function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // 모든 탭 비활성화
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // 선택한 탭 활성화
            btn.classList.add('active');
            const targetContent = document.getElementById(tabId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // 탭 변경 시 콜백 (필요시 추가)
            onTabChange(tabId);
        });
    });
}

// 탭 변경 콜백
function onTabChange(tabId) {
    console.log(`탭 변경: ${tabId}`);
    
    // 각 탭에 따른 데이터 로드 등 처리
    switch (tabId) {
        case 'home':
            // 홈 탭 데이터 로드
            break;
        case 'admin':
            // 관리 탭 데이터 로드
            break;
    }
}




