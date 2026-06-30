import { UIButton } from "./libs/ui.js";
import { getFbxApiUrl, FBX_UPLOAD_CONFIG, validateFBXFile } from "./config/fbx-upload-config.js";
import { loadMotionFileAndCreateTrack } from "./utils/motionTimelineAutoTrack.js";

/** 서버 없음·연결 실패·목록 비어 있음 → 패널에 항상 이 목록 표시 (files/fbx) */
const DEFAULT_LOCAL_FBX_LIST = [
    
    { path: "../files/fbx/Sitting.fbx", name: "Sitting", displayName: "Sitting", filename: "Sitting.fbx" },
    { path: "../files/fbx/Character1.fbx", name: "Character1", displayName: "Character1", filename: "Character1.fbx" },
    { path: "../files/fbx/Character2.fbx", name: "Character2", displayName: "Character2", filename: "Character2.fbx" },
    // { path: "../files/fbx/1.fbx", name: "1", displayName: "1", filename: "1.fbx" },
    // { path: "../files/fbx/2.fbx", name: "2", displayName: "2", filename: "2.fbx" },
    { path: "../files/fbx/Belly Dance.fbx", name: "Belly Dance", displayName: "Belly Dance", filename: "Belly Dance.fbx" },
    { path: "../files/fbx/Samba Dancing.fbx", name: "Samba Dancing", displayName: "Samba Dancing", filename: "Samba Dancing.fbx" },
];

function cloneDefaultLocalFbxList() {
    return DEFAULT_LOCAL_FBX_LIST.map((f) => ({ ...f }));
}

function fbxListFilenameKey(f) {
    return String(f.filename || f.name || "").toLowerCase();
}

/**
 * 서버에 없는 로컬 전용 FBX(예: 1.fbx, 2.fbx)를 목록 앞에 붙임.
 * 서버만 쓰면 업로드 안 된 파일은 절대 안 나옴.
 */
function prependLocalOnlyFbx(serverList) {
    const onServer = new Set(
        (serverList || []).map(fbxListFilenameKey).filter(Boolean)
    );
    const extra = DEFAULT_LOCAL_FBX_LIST.filter((f) => {
        const k = fbxListFilenameKey(f);
        return k && !onServer.has(k);
    }).map((f) => ({ ...f }));
    return extra.length ? [...extra, ...serverList] : serverList;
}

/** 서버 응답 대기 제한 (무응답 시 로컬 목록으로 폴백) */
function fetchFbxListWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, credentials: "include" }).finally(() =>
        clearTimeout(t)
    );
}

export function createMotionPanel(editor) {
    // 선택된 FBX 항목을 추적하는 변수
    let selectedFBXItem = null;

    // 다중 선택된 FBX 항목들을 추적하는 변수
    let selectedFBXItems = new Set();

    // Motion 패널
    const motionPanel = document.createElement("div");
    motionPanel.className = "motion-panel";

    // Motion 패널 컨텐츠
    const motionContent = document.createElement("div");
    motionContent.className = "panel-content";
    motionPanel.appendChild(motionContent);

    // FBX 목록 컨테이너 추가
    const fbxListContainer = document.createElement("div");
    fbxListContainer.className = "fbx-list-container";
    motionContent.appendChild(fbxListContainer);

    // FBX 업로드 기능
    const uploadSection = document.createElement("div");
    uploadSection.className = "upload-section";
    motionContent.appendChild(uploadSection);

    // 파일 입력 요소 (숨김) - 다중 선택 가능
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "fbxFileInput";
    fileInput.accept = ".fbx";
    fileInput.multiple = true; // 다중 선택 활성화
    fileInput.style.display = "none";
    uploadSection.appendChild(fileInput);

    // 불러오기 버튼 (다중 파일 선택)
    const uploadBtn = new UIButton("");
    uploadBtn.setInnerHTML("<i class='fas fa-upload'></i> ");
    uploadBtn.dom.title = "모션객체(FBX) 업로드";
    uploadBtn.onClick(async(event) => {
        event.preventDefault();
        event.stopPropagation();

        console.log("FBX 다중 파일 업로드 시작...");

        // 🚀 수정: getFbxApiUrl 사용하여 올바른 서버 URL 생성
        try {
            const healthResponse = await fetch(getFbxApiUrl(FBX_UPLOAD_CONFIG.ENDPOINTS.HEALTH), {
                method: 'GET',
                mode: 'cors',
                credentials: 'include'
            });

            if (!healthResponse.ok) {
                alert("서버에 연결할 수 없습니다. 서버를 시작해주세요.");
                return;
            }

            // 파일 선택 다이얼로그 열기
            fileInput.click();

        } catch (error) {
            console.error("❌ 서버 연결 확인 실패:", error);
            alert("서버에 연결할 수 없습니다. 서버를 시작해주세요.");
        }
    });

    // 파일 선택 이벤트 - 다중 파일 처리
    fileInput.addEventListener("change", async(event) => {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        console.log("📁 선택된 파일들:", files.length, "개");
        files.forEach(file => {
            console.log("  -", file.name, file.size, file.type);
        });

        try {
            // 모든 파일 유효성 검사
            const validFiles = [];
            const invalidFiles = [];

            for (const file of files) {
                if (validateSelectedFBXFile(file)) {
                    validFiles.push(file);
                } else {
                    invalidFiles.push(file);
                }
            }

            if (validFiles.length === 0) {
                showUploadError("유효한 FBX 파일이 없습니다.");
                return;
            }

            if (invalidFiles.length > 0) {
                console.warn("⚠️ 유효하지 않은 파일들:", invalidFiles.map(f => f.name));
                showUploadWarning(`${invalidFiles.length}개 파일이 유효하지 않아 제외되었습니다.`);
            }

            // 업로드 진행 상태 표시
            showUploadProgress(`${validFiles.length}개 파일 업로드 중...`);

            // 모든 유효한 파일을 서버에 업로드
            const uploadResults = await Promise.allSettled(
                validFiles.map(file => uploadFileToServer(file))
            );

            // 업로드 결과 분석
            const successfulUploads = [];
            const failedUploads = [];

            uploadResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value === true) {
                    successfulUploads.push(validFiles[index]);
                } else {
                    failedUploads.push(validFiles[index]);
                }
            });

            // 결과 표시
            if (successfulUploads.length > 0) {
                showUploadSuccess(`${successfulUploads.length}개 파일 업로드 완료!`);

                // 성공한 파일들을 씬에 추가
                await addFilesToScene(successfulUploads);
            }

            if (failedUploads.length > 0) {
                showUploadError(`${failedUploads.length}개 파일 업로드 실패`);
            }

            // 파일 입력 초기화
            fileInput.value = "";

            // FBX 목록 새로고침
            setTimeout(async() => {
                try {
                    await displayFBXList();
                    console.log("✅ FBX 목록 새로고침 완료");
                } catch (error) {
                    console.error("❌ FBX 목록 새로고침 실패:", error);
                }
            }, 1500);

        } catch (error) {
            console.error("❌ 파일 업로드 오류:", error);
            showUploadError(`업로드 오류: ${error.message}`);
        }
    });

    // Motion 패널 푸터
    const motionFooter = document.createElement("div");
    motionFooter.className = "panel-footer";
    motionPanel.appendChild(motionFooter);

    // FBX 불러오기 버튼을 Motion 패널에 직접 추가
    motionFooter.appendChild(uploadBtn.dom);
    // 선택된 파일들을 씬에 추가하는 버튼
    const selectsAddBtn = createSelectsAddBtn();
    selectsAddBtn.dom.title = "선택 항목 씬에 추가";
    motionFooter.appendChild(selectsAddBtn.dom);
    // 서버 연결 테스트 버튼
    // const testConnectionBtn = createTestConnectionButton();
    // motionFooter.appendChild(testConnectionBtn.dom);
    // 새로고침 버튼
    const refreshBtn = createRefreshButton();
    refreshBtn.dom.title = "목록 새로고침";
    motionFooter.appendChild(refreshBtn.dom);
    // 휴지통 버튼 
    const deleteBtn = createDeleteButton();
    deleteBtn.dom.title = "선택 항목 삭제";
    motionFooter.appendChild(deleteBtn.dom);


    // 새로고침 버튼 함수 생성
    function createRefreshButton() {
        const button = new UIButton("");
        button.setInnerHTML("<i class='fas fa-retweet'></i>");
        button.onClick(async() => {
            console.log("새로고침 버튼 클릭됨");
            try {
                await displayFBXList();
                console.log("✅ 새로고침 완료");
            } catch (error) {
                console.error("❌ 새로고침 실패:", error);
            }
        });
        return button;
    }

    // 휴지통 버튼 생성 및 관리
    function createDeleteButton() {
        const button = new UIButton("");
        button.setInnerHTML("<i class='fas fa-trash'></i>");
        button.setClass("Button");
        button.onClick(async() => {
            if (selectedFBXItems.size > 0) {
                await deleteSelectedFBX();
            } else {
                alert("삭제할 FBX 파일을 선택해주세요.");
            }
        });
        return button;
    }

    // 서버 연결 테스트 버튼
    function createTestConnectionButton() {
        const button = new UIButton("");
        button.setInnerHTML("<i class='fas fa-server'></i>");
        button.onClick(async() => {
            console.log("🔍 서버 연결 테스트 시작...");
            try {
                // 🚀 수정: getFbxApiUrl 사용하여 올바른 서버 URL 생성
                const healthResponse = await fetch(getFbxApiUrl(FBX_UPLOAD_CONFIG.ENDPOINTS.HEALTH), {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'include'
                });

                if (healthResponse.ok) {
                    const healthData = await healthResponse.json();
                    console.log("✅ 서버 응답:", healthData);
                    alert(`서버 연결 성공!\n상태: ${healthData.status || 'OK'}`);
                } else {
                    alert(`서버 연결 실패!\nHTTP ${healthResponse.status}: ${healthResponse.statusText}`);
                }
            } catch (error) {
                console.error("❌ 서버 연결 테스트 실패:", error);
                alert(`서버 연결 테스트 실패!\n오류: ${error.message}`);
            }
        });
        return button;
    }

    // 선택된 파일들을 씬에 추가하는 함수 생성
    function createSelectsAddBtn() {
        const button = new UIButton("");
        button.setInnerHTML("<i class='fas fa-plus'></i>");
        button.setClass("Button");
        button.dom.className += " selects-add-btn"; // CSS 클래스 추가
        button.dom.disabled = true;
        button.onClick(async(event) => {
            event.preventDefault();
            event.stopPropagation();

            if (selectedFBXItems.size === 0) {
                alert("씬에 추가할 파일을 선택해주세요.");
                return;
            }

            console.log("🚀 선택된 파일들을 씬에 추가 시작:", selectedFBXItems.size, "개");

            try {
                // 선택된 파일들을 씬에 추가
                const selectedFiles = Array.from(selectedFBXItems).map(item => {
                    const filename = item.dataset.filename;
                    const displayName = item.querySelector('.fbx-name').textContent;
                    const path = item.dataset.path || `../files/fbx/${filename}`;

                    return {
                        filename,
                        displayName,
                        path
                    };
                });

                console.log("📁 선택된 파일들:", selectedFiles);

                // 선택된 파일들을 씬에 추가
                await addSelectedFilesToScene(selectedFiles);

                // 선택 상태 초기화
                clearSelection();

            } catch (error) {
                console.error("❌ 선택된 파일들을 씬에 추가 중 오류:", error);
                alert(`파일 추가 중 오류가 발생했습니다: ${error.message}`);
            }
        });
        return button;
    }

    // 선택 해제 함수
    function clearSelection() {
        if (selectedFBXItem) {
            selectedFBXItem.classList.remove('selected');
            selectedFBXItem = null;
        }

        // 다중 선택된 항목들도 모두 해제
        selectedFBXItems.forEach(item => {
            item.classList.remove('selected');
        });
        selectedFBXItems.clear();

        console.log("🗑️ clearSelection에서 updateButtons 호출");
        updateButtons();
    }

    // 선택된 항목들 표시 함수
    function updateButtons() {
        const btns = [deleteBtn.dom, selectsAddBtn.dom];
        const selectedCount = selectedFBXItems.size;
        btns.forEach(btn => {
            if (btn) {
                if (selectedCount > 0) {
                    btn.disabled = false;
                } else {
                    btn.disabled = true;
                }
            }
        });
    }

    // 문서 전체 클릭 이벤트 (선택 해제용)
    function setupGlobalClickHandler() {
        document.addEventListener('click', (event) => {
            // fbx-item이나 관련 버튼을 클릭한 경우는 제외
            if (event.target.closest('.fbx-item') ||
                event.target.closest('.delete-fbx-btn') ||
                event.target.closest('.add-fbx-btn') ||
                event.target.closest('.selects-add-btn')) {
                return;
            }

            // 다른 곳을 클릭하면 선택 해제
            clearSelection();
        });
    }

    // 선택된 FBX 파일 삭제
    async function deleteSelectedFBX() {
        if (selectedFBXItems.size === 0) {
            alert("삭제할 FBX 파일을 선택해주세요.");
            return;
        }

        // 다중 선택된 파일들의 정보 수집
        const filesToDelete = Array.from(selectedFBXItems).map(item => ({
            filename: item.dataset.filename,
            displayName: item.querySelector('.fbx-name').textContent
        }));

        // 삭제 확인 메시지
        let confirmMessage;
        if (filesToDelete.length === 1) {
            const file = filesToDelete[0];
            confirmMessage = `정말로 "${file.displayName}" (${file.filename}) 파일을 삭제하시겠습니까?`;
        } else {
            const fileNames = filesToDelete.map(f => f.displayName).join(', ');
            confirmMessage = `정말로 ${filesToDelete.length}개 파일을 삭제하시겠습니까?\n\n${fileNames}`;
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            console.log("🗑️ FBX 파일 삭제 시작:", filesToDelete.length, "개");

            // 모든 선택된 파일을 순차적으로 삭제
            const results = [];
            for (let i = 0; i < filesToDelete.length; i++) {
                const fileInfo = filesToDelete[i];
                console.log(`🗑️ 파일 ${i + 1}/${filesToDelete.length} 삭제 중:`, fileInfo.filename);

                try {
                    // 서버에 삭제 요청
                    const response = await fetch(getFbxApiUrl(`${FBX_UPLOAD_CONFIG.ENDPOINTS.DELETE_FILE}/${encodeURIComponent(fileInfo.filename)}`), {
                        method: 'DELETE',
                        mode: 'cors',
                        credentials: 'include'
                    });

                    if (response.ok) {
                        console.log(`✅ ${fileInfo.filename} 삭제 성공`);
                        results.push({ filename: fileInfo.filename, success: true });
                    } else {
                        const errorText = await response.text();
                        console.error(`❌ ${fileInfo.filename} 삭제 실패:`, response.status, errorText);
                        results.push({ filename: fileInfo.filename, success: false, error: `HTTP ${response.status}` });
                    }
                } catch (error) {
                    console.error(`❌ ${fileInfo.filename} 삭제 중 오류:`, error);
                    results.push({ filename: fileInfo.filename, success: false, error: error.message });
                }
            }

            // 결과 분석
            const successfulDeletes = results.filter(r => r.success);
            const failedDeletes = results.filter(r => !r.success);

            // 결과 표시
            if (successfulDeletes.length > 0) {
                if (successfulDeletes.length === 1) {
                    alert(`"${successfulDeletes[0].filename}" 파일이 삭제되었습니다.`);
                } else {
                    alert(`${successfulDeletes.length}개 파일이 성공적으로 삭제되었습니다.`);
                }
                console.log("✅ 삭제 성공한 파일들:", successfulDeletes.map(r => r.filename));
            }

            if (failedDeletes.length > 0) {
                const failedNames = failedDeletes.map(r => r.filename).join(', ');
                alert(`${failedDeletes.length}개 파일 삭제에 실패했습니다:\n${failedNames}`);
                console.error("❌ 삭제 실패한 파일들:", failedDeletes);
            }

            // 선택 상태 초기화
            clearSelection();

            // 목록 새로고침
            await displayFBXList();

        } catch (error) {
            console.error("❌ FBX 파일 삭제 중 오류:", error);
            alert(`파일 삭제 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    // FBX 목록 표시 함수
    async function displayFBXList() {
        const fbxListContainer = motionPanel.querySelector('.fbx-list-container');
        if (!fbxListContainer) {
            console.error("❌ fbxListContainer를 찾을 수 없습니다");
            return;
        }

        console.log("📋 기존 목록 제거 중...");
        // 기존 목록 제거
        fbxListContainer.innerHTML = '';

        // 선택 상태 초기화
        clearSelection();

        try {
            console.log("📡 FBX 파일 목록 로드 중...");
            const fbxFiles = await loadFBXFilesFromFolder();
            console.log("📥 로드된 FBX 파일 수:", fbxFiles ? fbxFiles.length : 0);

            if (!fbxFiles || fbxFiles.length === 0) {
                console.log("FBX 파일이 없음 - 안내 메시지 표시");
                const noFilesMessage = document.createElement("div");
                noFilesMessage.className = "no-files-message";
                noFilesMessage.innerHTML = `
          <p>사용 가능한 FBX 파일이 없습니다.</p>
          <p>files/fbx 폴더에 FBX 파일을 추가해주세요.</p>
        `;
                fbxListContainer.appendChild(noFilesMessage);
                return;
            }

            console.log("🔧 FBX 목록 UI 생성 중...");
            fbxFiles.forEach((fbxFile, index) => {
                console.log(`📁 FBX ${index + 1}:`, fbxFile.displayName);

                const fbxItem = document.createElement("div");
                fbxItem.className = "fbx-item";
                fbxItem.dataset.filename = fbxFile.filename || fbxFile.name;
                fbxItem.innerHTML = `
          <div class="fbx-info">
            <span class="fbx-name">${fbxFile.displayName}</span>
            <span class="fbx-filename">${fbxFile.filename || fbxFile.name}</span>
          </div>
          <button class="add-fbx-btn sb-dock-btn sb-dock-btn--icon" title="모션 타임라인에 트랙 추가">
            <i class="fas fa-plus"></i>
          </button>
        `;

                // FBX 항목 클릭 이벤트 (토글 선택 지원)
                fbxItem.addEventListener("click", (event) => {
                    // 버튼 클릭은 제외
                    if (event.target.closest('.add-fbx-btn')) {
                        return;
                    }

                    // Ctrl/Cmd + 클릭으로 다중 선택/해제
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();

                        if (selectedFBXItems.has(fbxItem)) {
                            // 이미 선택된 항목이면 선택 해제
                            selectedFBXItems.delete(fbxItem);
                            fbxItem.classList.remove('selected');
                            console.log("🎬 FBX 항목 선택 해제됨:", fbxFile.displayName);
                        } else {
                            // 새로 선택
                            selectedFBXItems.add(fbxItem);
                            fbxItem.classList.add('selected');
                            console.log("🎬 FBX 항목 다중 선택됨:", fbxFile.displayName);
                        }
                    } else {
                        // 일반 클릭으로 토글 선택
                        if (selectedFBXItems.has(fbxItem)) {
                            // 이미 선택된 항목이면 선택 해제
                            selectedFBXItems.delete(fbxItem);
                            fbxItem.classList.remove('selected');
                            console.log("🎬 FBX 항목 선택 해제됨:", fbxFile.displayName);
                        } else {
                            // 새로 선택
                            selectedFBXItems.add(fbxItem);
                            fbxItem.classList.add('selected');
                            console.log("🎬 FBX 항목 선택됨:", fbxFile.displayName);
                        }
                    }

                    // 단일 선택 상태 업데이트 (휴지통 버튼용)
                    if (selectedFBXItems.size === 1) {
                        selectedFBXItem = Array.from(selectedFBXItems)[0];
                    } else {
                        selectedFBXItem = null;
                    }

                    // 휴지통 버튼 상태 업데이트
                    try {
                        updateDeleteButton();
                    } catch (error) {
                        console.log("🔍 휴지통 버튼 상태 업데이트 실패:", error.message);
                    }

                    // 선택된 항목들 표시
                    console.log("🎯 선택 상태 변경 후 updateButtons 호출");
                    updateButtons();
                });

                // 추가 버튼 클릭 이벤트
                const addBtn = fbxItem.querySelector(".add-fbx-btn");
                if (addBtn) {
                    console.log(`🔘 FBX ${index + 1}의 추가 버튼 이벤트 리스너 연결`);

                    // 중복 추가 방지를 위한 상태 추적
                    let isAdding = false;

                    addBtn.addEventListener("click", async(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (isAdding) {
                            console.log("이미 추가 중입니다...");
                            return;
                        }

                        console.log("FBX 파일을 씬에 가져오기 시작:", fbxFile.displayName);

                        // 버튼 상태 변경
                        isAdding = true;
                        addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 가져오는 중...';
                        addBtn.disabled = true;
                        addBtn.classList.add('adding');

                        try {
                            const fileBlob = await fetch(fbxFile.path).then(r => r.blob());
                            const file = new File([fileBlob], fbxFile.filename || fbxFile.name, {
                                type: 'application/octet-stream'
                            });

                            const dataTransfer = new DataTransfer();
                            dataTransfer.items.add(file);
                            const fileList = dataTransfer.files;

                            await loadMotionFileAndCreateTrack(editor, fileList, {
                                fileName: fbxFile.filename || fbxFile.name,
                                displayName: fbxFile.displayName || fbxFile.name,
                            });

                            console.log("✅ FBX 씬 + 모션 트랙 추가 성공:", fbxFile.displayName);
                            showAddSuccess(`${fbxFile.displayName} — 씬 및 모션 트랙에 추가됨`);

                                // 버튼을 체크 표시로 변경 (가져오기 완료 표시)
                                addBtn.classList.remove('adding');
                                addBtn.classList.add('success');
                                addBtn.innerHTML = '<i class="fas fa-check"></i> 가져옴';

                                // 3초 후 원래 상태로 복원
                                setTimeout(() => {
                                    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                                    addBtn.classList.remove('success');
                                    addBtn.disabled = false;
                                    isAdding = false;
                                }, 3000);

                            console.log("FBX 파일이 씬과 타임라인에 추가됨:", fbxFile.displayName);

                        } catch (error) {
                            console.error("❌ FBX 파일 가져오기 실패:", error);

                            // 오류 피드백
                            showAddError(fbxFile.displayName, error.message);

                            // 버튼 상태 복원
                            addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                            addBtn.classList.remove('adding');
                            addBtn.disabled = false;
                            isAdding = false;
                        }
                    });
                } else {
                    console.error(`❌ FBX ${index + 1}의 추가 버튼을 찾을 수 없습니다`);
                }

                fbxListContainer.appendChild(fbxItem);
                console.log(`✅ FBX ${index + 1} UI 항목 추가 완료`);
            });

            console.log("✅ FBX 목록 UI 생성 완료");

        } catch (error) {
            console.error("❌ FBX 목록 표시 실패:", error);
        }
    }


    // 🚀 수정: 함수명을 validateSelectedFBXFile로 변경
    function validateSelectedFBXFile(file) {
        const validation = validateFBXFile(file); // import된 함수 사용
        if (!validation.isValid) {
            showUploadError(validation.error);
            return false;
        }
        return true;
    }

    // 여러 파일을 씬에 추가하는 함수
    async function addFilesToScene(files) {
        try {
            console.log("🚀 여러 파일을 씬에 추가 시작:", files.length, "개");

            // 진행 상태 표시
            showAddProgress(`${files.length}개 파일을 씬에 추가 중...`);

            // 모든 파일을 순차적으로 씬에 추가
            const results = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                console.log(`📁 파일 ${i + 1}/${files.length} 추가 중:`, file.name);

                try {
                    // 진행 상태 업데이트
                    showAddProgress(`${file.name} 추가 중... (${i + 1}/${files.length})`);

                    const fileList = new DataTransfer();
                    fileList.items.add(file);

                    await loadMotionFileAndCreateTrack(editor, fileList.files, {
                        fileName: file.name,
                        displayName: file.name,
                    });
                    results.push({ file: file.name, success: true });
                    console.log(`✅ ${file.name} 씬 + 모션 트랙 추가 완료`);
                } catch (error) {
                    console.error(`❌ ${file.name} 씬에 추가 실패:`, error);
                    results.push({ file: file.name, success: false, error: error.message });
                }
            }

            // 진행 상태 메시지 제거
            clearAddProgress();

            // 결과 분석
            const successfulAdds = results.filter(r => r.success);
            const failedAdds = results.filter(r => !r.success);

            // 결과 표시
            if (successfulAdds.length > 0) {
                showAddSuccess(`${successfulAdds.length}개 파일을 씬·모션 트랙에 추가했습니다!`);
                console.log("✅ 씬에 추가된 파일들:", successfulAdds.map(r => r.file));
            }

            if (failedAdds.length > 0) {
                showAddError(`${failedAdds.length}개 파일 추가에 실패했습니다.`);
                console.error("❌ 씬에 추가 실패한 파일들:", failedAdds);
            }

            return { successful: successfulAdds.length, failed: failedAdds.length };

        } catch (error) {
            // 오류 발생 시에도 진행 상태 메시지 제거
            clearAddProgress();

            console.error("❌ 여러 파일 씬 추가 중 오류:", error);
            showAddError(`여러 파일 추가 중 오류: ${error.message}`);
            return { successful: 0, failed: files.length };
        }
    }

    // 선택된 파일들을 씬에 추가하는 함수
    async function addSelectedFilesToScene(selectedFiles) {
        try {
            console.log("🚀 선택된 파일들을 씬에 추가 시작:", selectedFiles.length, "개");

            // 진행 상태 표시
            showAddProgress(`${selectedFiles.length}개 선택된 파일을 씬에 추가 중...`);

            // 모든 파일을 순차적으로 씬에 추가
            const results = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                const fileInfo = selectedFiles[i];
                console.log(`📁 파일 ${i + 1}/${selectedFiles.length} 추가 중:`, fileInfo.displayName);

                try {
                    // 진행 상태 업데이트
                    showAddProgress(`${fileInfo.displayName} 추가 중... (${i + 1}/${selectedFiles.length})`);

                    // 파일을 Blob으로 가져와서 File 객체 생성
                    const fileBlob = await fetch(fileInfo.path).then(r => r.blob());
                    const file = new File([fileBlob], fileInfo.filename, {
                        type: 'application/octet-stream'
                    });

                    const fileList = new DataTransfer();
                    fileList.items.add(file);

                    await loadMotionFileAndCreateTrack(editor, fileList.files, {
                        fileName: fileInfo.filename,
                        displayName: fileInfo.displayName || fileInfo.name,
                    });
                    results.push({ file: fileInfo.displayName, success: true });
                    console.log(`✅ ${fileInfo.displayName} 씬 + 모션 트랙 추가 완료`);
                } catch (error) {
                    console.error(`❌ ${fileInfo.displayName} 씬에 추가 실패:`, error);
                    results.push({ file: fileInfo.displayName, success: false, error: error.message });
                }
            }

            // 진행 상태 메시지 제거
            clearAddProgress();

            // 결과 분석
            const successfulAdds = results.filter(r => r.success);
            const failedAdds = results.filter(r => !r.success);

            // 결과 표시
            if (successfulAdds.length > 0) {
                showAddSuccess(`${successfulAdds.length}개 파일을 씬·모션 트랙에 추가했습니다!`);
                console.log("✅ 씬에 추가된 파일들:", successfulAdds.map(r => r.file));
            }

            if (failedAdds.length > 0) {
                showAddError(`${failedAdds.length}개 파일 추가에 실패했습니다.`);
                console.error("❌ 씬에 추가 실패한 파일들:", failedAdds);
            }

            return { successful: successfulAdds.length, failed: failedAdds.length };

        } catch (error) {
            // 오류 발생 시에도 진행 상태 메시지 제거
            clearAddProgress();

            console.error("❌ 선택된 파일들을 씬에 추가 중 오류:", error);
            showAddError(`선택된 파일들을 씬에 추가 중 오류: ${error.message}`);
            return { successful: 0, failed: selectedFiles.length };
        }
    }

    // 파일 업로드 함수
    async function uploadFileToServer(file) {
        try {
            const formData = new FormData();
            formData.append('fbxFile', file);

            console.log("📤 업로드 요청 시작:", file.name);
            const response = await fetch(getFbxApiUrl(FBX_UPLOAD_CONFIG.ENDPOINTS.UPLOAD), {
                method: 'POST',
                body: formData,
                mode: 'cors',
                credentials: 'include'
            });

            console.log("📥 서버 응답:", response.status, response.statusText);

            if (response.ok) {
                const result = await response.json();
                console.log("✅ 업로드 성공:", result);
                return true;
            } else {
                const errorText = await response.text();
                console.error("❌ 업로드 실패:", response.status, errorText);
                showUploadError(`업로드 실패: HTTP ${response.status}`);
                return false;
            }

        } catch (error) {
            console.error("❌ 업로드 중 오류:", error);
            showUploadError(`업로드 오류: ${error.message}`);
            return false;
        }
    }

    // 업로드 진행 상태 표시
    function showUploadProgress(fileName) {
        const existingProgress = uploadSection.querySelector(".upload-progress");
        if (existingProgress) existingProgress.remove();

        const progressDiv = document.createElement("div");
        progressDiv.className = "upload-progress";
        progressDiv.innerHTML = `
      <div class="progress-text">📤 ${fileName} 업로드 중...</div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;

        uploadSection.appendChild(progressDiv);
    }

    // 업로드 성공 메시지 표시
    function showUploadSuccess(fileName) {
        const existingProgress = uploadSection.querySelector(".upload-progress");
        if (existingProgress) existingProgress.remove();

        const successDiv = document.createElement("div");
        successDiv.className = "upload-success";
        successDiv.innerHTML = `
      <div class="success-text">✅ ${fileName} 업로드 완료!</div>
    `;

        uploadSection.appendChild(successDiv);

        // 3초 후 제거
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 3000);
    }

    // 업로드 오류 메시지 표시
    function showUploadError(message) {
        const existingProgress = uploadSection.querySelector(".upload-progress");
        if (existingProgress) existingProgress.remove();

        const errorDiv = document.createElement("div");
        errorDiv.className = "upload-error";
        errorDiv.innerHTML = `
      <div class="error-text">❌ ${message}</div>
    `;

        errorDiv.appendChild(errorDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // 업로드 경고 메시지 표시
    function showUploadWarning(message) {
        const existingProgress = uploadSection.querySelector(".upload-progress");
        if (existingProgress) existingProgress.remove();

        const warningDiv = document.createElement("div");
        warningDiv.className = "upload-warning";
        warningDiv.innerHTML = `
      <div class="warning-text">⚠️ ${message}</div>
    `;

        uploadSection.appendChild(warningDiv);

        // 3초 후 제거
        setTimeout(() => {
            if (warningDiv.parentNode) {
                warningDiv.remove();
            }
        }, 3000);
    }

    // FBX 추가 성공 메시지 표시
    function showAddSuccess(fbxName) {
        const existingMessage = motionPanel.querySelector(".add-success-message");
        if (existingMessage) existingMessage.remove();

        const successDiv = document.createElement("div");
        successDiv.className = "add-success-message";
        successDiv.innerHTML = `
      <div class="success-text">✅ "${fbxName}" 씬에 가져옴!</div>
      <div class="success-detail">3D 뷰포트에서 모델을 확인할 수 있습니다.</div>
    `;

        motionPanel.appendChild(successDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 5000);
    }

    // FBX 추가 실패 메시지 표시
    function showAddError(fbxName, errorMessage) {
        const existingMessage = motionPanel.querySelector(".add-success-message");
        if (existingMessage) existingMessage.remove();

        const errorDiv = document.createElement("div");
        errorDiv.className = "add-error-message";
        errorDiv.innerHTML = `
      <div class="error-text">❌ "${fbxName}" 씬 가져오기 실패: ${errorMessage}</div>
      <div class="error-detail">파일 경로와 형식을 확인해주세요.</div>
    `;

        motionPanel.appendChild(errorDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // FBX 추가 진행 상태 표시
    function showAddProgress(message) {
        const existingProgress = motionPanel.querySelector(".add-progress-message");
        if (existingProgress) existingProgress.remove();

        const progressDiv = document.createElement("div");
        progressDiv.className = "add-progress-message";
        progressDiv.innerHTML = `
      <div class="progress-text">🔄 ${message}</div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;

        motionPanel.appendChild(progressDiv);
    }

    // FBX 추가 진행 상태 메시지 제거
    function clearAddProgress() {
        const existingProgress = motionPanel.querySelector(".add-progress-message");
        if (existingProgress) {
            existingProgress.remove();
            console.log("🧹 진행 상태 메시지 제거됨");
        }
    }

    // FBX 파일 목록: 서버에 등록된 목록이 있을 때만 서버 사용, 그 외는 전부 로컬 기본 목록
    async function loadFBXFilesFromFolder() {
        const url = getFbxApiUrl(FBX_UPLOAD_CONFIG.ENDPOINTS.GET_FILES);
        try {
            console.log("FBX 목록 요청:", url);
            const response = await fetchFbxListWithTimeout(url, 5000);

            if (!response.ok) {
                console.warn("FBX 서버 응답 실패 → 로컬 기본 목록", response.status);
                return cloneDefaultLocalFbxList();
            }

            let fbxFiles;
            try {
                fbxFiles = await response.json();
            } catch (e) {
                console.warn("FBX 목록 JSON 파싱 실패 → 로컬 기본 목록", e);
                return cloneDefaultLocalFbxList();
            }

            if (!Array.isArray(fbxFiles) || fbxFiles.length === 0) {
                console.log("서버에 등록된 FBX 없음 → 로컬 기본 목록 사용");
                return cloneDefaultLocalFbxList();
            }

            const processedFiles = fbxFiles.map((file) => ({
                path: `..${file.path}`,
                name: file.name,
                displayName: file.displayName,
                filename: file.filename,
            }));
            const merged = prependLocalOnlyFbx(processedFiles);
            console.log(
                "서버 FBX + 로컬 전용 병합:",
                merged.length,
                "개 (서버",
                processedFiles.length,
                ")"
            );
            return merged;
        } catch (error) {
            console.warn(
                "FBX 서버 미연결/타임아웃 → 로컬 기본 목록:",
                error && error.name === "AbortError" ? "timeout" : error
            );
            return cloneDefaultLocalFbxList();
        }
    }

    // 전역 클릭 핸들러 설정
    setupGlobalClickHandler();

    // 초기 FBX 목록 로드 (휴지통 버튼 생성 후)
    setTimeout(async() => {
        try {
            console.log("🚀 초기 FBX 목록 로드 시작");
            await displayFBXList();
            console.log("✅ 초기 FBX 목록 로드 완료");

            // 초기 선택 상태 표시 업데이트
            console.log("🚀 초기화 후 updateButtons 호출");
            updateButtons();
        } catch (error) {
            console.error("❌ 초기 FBX 목록 로드 실패:", error);
        }
    }, 100);

    return motionPanel;
}