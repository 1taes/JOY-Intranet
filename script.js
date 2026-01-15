// Joy Enter - 메인 스크립트
import { initGlobals, currentUser, updateGlobal } from './modules/globals.js';
import { setupAuth, checkLogin, ROLE_LEVELS, ROLE_NAMES } from './modules/auth.js';
import { setupTabs } from './modules/ui.js';
import { displayPendingUsers, displayUserRoleManagement, setupWeeklyPayExport } from './modules/admin.js';
import { setupTransaction, loadTransactionRecords, setupTransactionAdmin, displayTransactionItems } from './modules/transaction.js';
import { setupRp, loadRpItemsList, setupRpItemsAdmin } from './modules/rp.js';
import { setupVoucher, loadVoucherTypesList, setupVoucherAdmin } from './modules/voucher.js';
import { setupOrgChart, loadOrgMembersList } from './modules/orgchart.js';
import { setupCalendar, getTodayEvents } from './modules/calendar.js';
import { setupEvent, setupEventAdmin, displayEventItems } from './modules/event.js';
import { setupSearch } from './modules/search.js';
import { displayWeeklyStats } from './modules/homeStats.js';
import { setupStatistics } from './modules/statistics.js';

// 앱 초기화
async function initApp() {
    console.log('Joy Enter 시스템 초기화 중...');
    
    // 전역 변수 초기화
    await initGlobals();
    
    // 인증 설정
    setupAuth();
    
    // 로그인 체크
    const loggedIn = await checkLogin();
    
    if (loggedIn) {
        showMainContainer();
    }
}

// 메인 컨테이너 표시
function showMainContainer() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('mainContainer').style.display = 'block';
    
    // 사용자 정보 표시
    if (currentUser) {
        document.getElementById('userInfo').textContent = `${currentUser.uid}님`;
        
        // 권한 배지 표시
        const roleBadge = document.getElementById('userRole');
        const role = currentUser.role || 0;
        const roleName = ROLE_NAMES[role] || '일반';
        roleBadge.textContent = roleName;
        roleBadge.className = 'role-badge';
        
        if (role >= ROLE_LEVELS.ADMIN) {
            roleBadge.classList.add('admin');
        } else if (role >= ROLE_LEVELS.SENIOR) {
            roleBadge.classList.add('senior');
        } else if (role >= ROLE_LEVELS.EXECUTIVE) {
            roleBadge.classList.add('executive');
        } else {
            roleBadge.classList.add('normal');
        }
        
        // 고위직 이상이면 관리 탭 및 통계 탭 표시
        if (role >= ROLE_LEVELS.SENIOR || currentUser.isAdmin) {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = '';
            });
            document.querySelectorAll('.senior-only').forEach(el => {
                el.style.display = '';
            });
            displayPendingUsers();
            displayUserRoleManagement();
            setupWeeklyPayExport();
            displayTransactionItems();
            setupTransactionAdmin();
            loadVoucherTypesList();
            setupVoucherAdmin();
            loadRpItemsList();
            setupRpItemsAdmin();
            displayEventItems();
            setupEventAdmin();
            loadOrgMembersList();
            setupStatistics();
        }
        
        // 간부직 이상이면 캘린더 일정 추가 표시
        if (role >= ROLE_LEVELS.EXECUTIVE) {
            document.querySelectorAll('.executive-only').forEach(el => {
                el.style.display = '';
            });
        }
    }
    
    // 탭 설정
    setupTabs();
    
    // 거래보고서 설정
    setupTransaction();
    
    // RP보고서 설정
    setupRp();
    
    // 지원권 설정
    setupVoucher();
    
    // 조직도 설정
    setupOrgChart();
    
    // 캘린더 설정
    setupCalendar();
    
    // 이벤트 설정
    setupEvent();
    
    // 검색 설정
    setupSearch();
    
    // 홈 통계 표시
    displayWeeklyStats();
}

// 전역으로 노출
window.showMainContainer = showMainContainer;

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', initApp);
