import { UIButton } from "./libs/ui.js";
import { createPanel } from './ui/floatPanel.js';
import { getApiUrl, AUDIO_UPLOAD_CONFIG } from "./config/audio-upload-config.js";

/**
 * 서버 미연결 시 사용할 로컬 기본 음악 (AudioTimeline.js 와 동일)
 */
const DEFAULT_LOCAL_AUDIO_LIST = [
  {
    path: "../files/music/SUJESHUN.mp3",
    name: "SUJESHUN",
    displayName: "수제순",
    filename: "SUJESHUN.mp3",
  },
  {
    path: "../files/music/DRAMA.mp3",
    name: "DRAMA",
    displayName: "드라마",
    filename: "DRAMA.mp3",
  },
];

function cloneDefaultLocalAudioList() {
    return DEFAULT_LOCAL_AUDIO_LIST.map((f) => ({ ...f }));
}

function audioListFilenameKey(f) {
    return String(f.filename || f.name || "").toLowerCase();
}

/** 서버에 없는 로컬 전용 항목(nanseol 등)을 목록 앞에 붙임 */
function prependLocalOnlyAudio(serverList) {
    const onServer = new Set((serverList || []).map(audioListFilenameKey).filter(Boolean));
    const extra = DEFAULT_LOCAL_AUDIO_LIST.filter((f) => {
        const k = audioListFilenameKey(f);
        return k && !onServer.has(k);
    }).map((f) => ({ ...f }));
    return extra.length ? [...extra, ...serverList] : serverList;
}

/** 서버 응답 대기 제한 (무응답 시 로컬 목록으로 폴백) */
function fetchAudioListWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, credentials: "include" }).finally(() => clearTimeout(t));
}

export function createAudioPanel(editor) {
    // 선택된 음악 항목을 추적하는 변수
    let selectedAudioItem = null;

    // 다중 선택된 음악 항목들을 추적하는 변수
    let selectedAudioItems = new Set();
    // Sound 패널
    const soundPanel = document.createElement("div");
    soundPanel.className = "sound-panel";

    // Sound 패널 컨텐츠
    const soundContent = document.createElement("div");
    soundContent.className = "panel-content";
    soundPanel.appendChild(soundContent);

    // 음악 목록 컨테이너 추가
    const audioListContainer = document.createElement("div");
    audioListContainer.className = "audio-list-container";
    soundContent.appendChild(audioListContainer);

    // Sound 패널 푸터
    const soundFooter = document.createElement("div");
    soundFooter.className = "panel-footer";
    soundPanel.appendChild(soundFooter);

    // 음악 업로드 기능
    const uploadSection = document.createElement("div");
    uploadSection.className = "upload-section";
    // 업로드 섹션을 Sound 패널 컨텐츠에 추가
    soundContent.appendChild(uploadSection);

    // 파일 입력 요소 (숨김)
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.id = "audioFileInput";
    fileInput.multiple = true; // 다중 선택 활성화
    fileInput.accept = "audio/*";
    fileInput.style.display = "none";
    uploadSection.appendChild(fileInput);

    // 불러오기 버튼
    const uploadBtn = new UIButton("");
    uploadBtn.setInnerHTML("<i class='fas fa-upload'></i>");
    uploadBtn.dom.title = "오디오 업로드";
    uploadBtn.onClick(async(event) => {
        event.preventDefault();
        event.stopPropagation();

        console.log("🎵 음악 업로드 시작...");

        // 서버 연결 상태 확인
        try {
            const healthUrl = getApiUrl('/api/health');
            console.log("🔍 서버 연결 확인 URL:", healthUrl);

            const healthResponse = await fetch(healthUrl, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include'
            });

            console.log("🏥 서버 연결 상태:", healthResponse.status, healthResponse.statusText);

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

    // 음악 불러오기 버튼을 Sound 패널에 직접 추가
    soundFooter.appendChild(uploadBtn.dom);

    // 선택된 파일들 추가 버튼
    const selectsAddBtn = createSelectsAddBtn();
    selectsAddBtn.dom.title = "선택 항목 트랙에 추가";
    soundFooter.appendChild(selectsAddBtn.dom);

    // 새로고침 버튼
    const refreshBtn = new UIButton("");
    refreshBtn.setInnerHTML("<i class='fas fa-retweet'></i>");
    refreshBtn.dom.title = "목록 새로고침";
    refreshBtn.onClick(async() => {
        console.log("새로고침 버튼 클릭됨");
        try {
            await displayAudioList();
            console.log("✅ 새로고침 완료");
        } catch (error) {
            console.error("❌ 새로고침 실패:", error);
        }
    });
    soundFooter.appendChild(refreshBtn.dom);

    // 휴지통 버튼 추가
    const deleteBtn = createDeleteButton();
    deleteBtn.dom.title = "선택 항목 삭제";
    soundFooter.appendChild(deleteBtn.dom);

    // 음악 파일 목록: 서버 미연결·빈 목록이면 로컬 기본 목록, 서버 목록 있으면 그 앞에 로컬 전용 항목 병합
    async function loadAudioFilesFromFolder() {
        const url = getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.GET_FILES);
        try {
            console.log("음악 목록 요청:", url);
            const response = await fetchAudioListWithTimeout(url, 5000);

            if (!response.ok) {
                console.warn("음악 서버 응답 실패 → 로컬 기본 목록", response.status);
                return cloneDefaultLocalAudioList();
            }

            let audioFiles;
            try {
                audioFiles = await response.json();
            } catch (e) {
                console.warn("음악 목록 JSON 파싱 실패 → 로컬 기본 목록", e);
                return cloneDefaultLocalAudioList();
            }

            if (!Array.isArray(audioFiles) || audioFiles.length === 0) {
                console.log("서버에 등록된 음악 없음 → 로컬 기본 목록 사용");
                return cloneDefaultLocalAudioList();
            }

            const processedFiles = audioFiles.map((file) => ({
                path: `..${file.path}`,
                name: file.name,
                displayName: file.displayName,
                filename: file.filename,
            }));
            const merged = prependLocalOnlyAudio(processedFiles);
            console.log("서버 음악 + 로컬 전용 병합:", merged.length, "개 (서버", processedFiles.length, ")");
            return merged;
        } catch (error) {
            console.warn(
                "음악 서버 미연결/타임아웃 → 로컬 기본 목록:",
                error && error.name === "AbortError" ? "timeout" : error
            );
            return cloneDefaultLocalAudioList();
        }
    }

    // 휴지통 버튼 생성 및 관리
    function createDeleteButton() {
        const deleteBtn = new UIButton("");
        deleteBtn.setInnerHTML("<i class='fas fa-trash'></i>");
        deleteBtn.setClass("Button");
        deleteBtn.dom.className += " delete-audio-btn";
        deleteBtn.onClick(async() => {
            if (selectedAudioItems.size > 0) {
                await deleteSelectedAudio();
            } else {
                alert("삭제할 음악 파일을 선택해주세요.");
            }
        });
        return deleteBtn;
    }

    // 선택된 파일들을 오디오 트랙에 추가하는 함수 생성
    function createSelectsAddBtn() {
        const button = new UIButton("");
        button.setInnerHTML("<i class='fas fa-plus'></i>");
        button.setClass("Button");
        button.dom.className += " selects-add-btn"; // CSS 클래스 추가
        button.dom.disabled = true;

        button.onClick(async(event) => {
            event.preventDefault();
            event.stopPropagation();

            if (selectedAudioItems.size === 0) {
                alert("오디오 트랙에 추가할 파일을 선택해주세요.");
                return;
            }

            console.log("🚀 선택된 파일들을 오디오 트랙에 추가 시작:", selectedAudioItems.size, "개");

            try {
                // 선택된 파일들을 오디오 트랙에 추가
                const selectedFiles = Array.from(selectedAudioItems).map(item => {
                    const filename = item.dataset.filename;
                    const displayName = item.querySelector('.audio-name').textContent;
                    const path = item.dataset.path || `../files/music/${filename}`;

                    return {
                        filename,
                        displayName,
                        path
                    };
                });

                console.log("📁 선택된 파일들:", selectedFiles);

                // 선택된 파일들을 오디오 트랙에 추가
                await addSelectedFilesToAudioTimeline(selectedFiles);

                // 선택 상태 초기화
                clearSelection();

            } catch (error) {
                console.error("❌ 선택된 파일들을 오디오 트랙에 추가 중 오류:", error);
                alert(`파일 추가 중 오류가 발생했습니다: ${error.message}`);
            }
        });
        return button;
    }

    // 선택된 음악 파일 삭제
    async function deleteSelectedAudio() {
        if (selectedAudioItems.size === 0) {
            alert("삭제할 음악을 선택해주세요.");
            return;
        }

        // 다중 선택된 파일들의 정보 수집
        const filesToDelete = Array.from(selectedAudioItems).map(item => ({
            filename: item.dataset.filename,
            displayName: item.querySelector('.audio-name').textContent
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
            console.log("🗑️ 음악 파일 삭제 시작:", filesToDelete.length, "개");

            // 모든 선택된 파일을 순차적으로 삭제
            const results = [];
            for (let i = 0; i < filesToDelete.length; i++) {
                const fileInfo = filesToDelete[i];
                console.log(`🗑️ 파일 ${i + 1}/${filesToDelete.length} 삭제 중:`, fileInfo.filename);

                try {
                    // 서버에 삭제 요청
                    const deleteUrl = getApiUrl(`${AUDIO_UPLOAD_CONFIG.ENDPOINTS.DELETE_FILE}/${encodeURIComponent(fileInfo.filename)}`);
                    console.log(`🗑️ 삭제 요청 URL:`, deleteUrl);

                    const response = await fetch(deleteUrl, {
                        method: 'DELETE',
                        mode: 'cors',
                        credentials: 'include'
                    });

                    console.log(`📥 ${fileInfo.filename} 삭제 응답:`, response.status, response.statusText);

                    if (response.ok) {
                        console.log(`✅ ${fileInfo.filename} 삭제 성공`);
                        results.push({ filename: fileInfo.filename, success: true });
                    } else {
                        const errorText = await response.text();
                        console.error(`❌ ${fileInfo.filename} 삭제 실패:`, response.status, errorText);
                        results.push({ filename: fileInfo.filename, success: false, error: `HTTP ${response.status}: ${errorText}` });
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
            await displayAudioList();

        } catch (error) {
            console.error("❌ 음악 파일 삭제 중 오류:", error);
            alert(`파일 삭제 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    // 파일 선택 이벤트
    fileInput.addEventListener("change", async(event) => {
        const file = event.target.files[0];
        if (!file) return;

        console.log("📁 선택된 파일:", file.name, file.size, file.type);

        try {
            // 파일 유효성 검사
            if (!validateAudioFile(file)) {
                return;
            }

            // 업로드 진행 상태 표시
            showUploadProgress(file.name);

            // 파일을 서버에 업로드
            const success = await uploadFileToServer(file);

            if (success) {
                // 성공 메시지 표시
                showUploadSuccess(file.name);

                // 파일 입력 초기화
                fileInput.value = "";

                // 음악 목록 새로고침 (즉시 실행)
                console.log("🔄 음악 목록 새로고침 시작...");

                // 잠시 대기 후 새로고침 (서버에서 파일 처리 시간 고려)
                setTimeout(async() => {
                    try {
                        await displayAudioList();
                        console.log("✅ 음악 목록 새로고침 완료");
                    } catch (error) {
                        console.error("❌ 음악 목록 새로고침 실패:", error);
                    }
                }, 1500);

            } else {
                showUploadError("파일 업로드에 실패했습니다.");
            }

        } catch (error) {
            console.error("❌ 파일 업로드 오류:", error);
            showUploadError(`업로드 오류: ${error.message}`);
        }
    });

    // 선택 해제 함수
    function clearSelection() {
        if (selectedAudioItem) {
            selectedAudioItem.classList.remove('selected');
            selectedAudioItem = null;
        }

        // 다중 선택된 항목들도 모두 해제
        selectedAudioItems.forEach(item => {
            item.classList.remove('selected');
        });
        selectedAudioItems.clear();
        updateButtons();
    }

    // 선택된 항목들 표시 함수
    function updateButtons() {
        const btns = [deleteBtn.dom, selectsAddBtn.dom];
        const selectedCount = selectedAudioItems.size;
        console.log("🔧 updateButtons 호출됨:", { selectedCount });
        btns.forEach(btn => {
            if (btn) {
                console.log("🔍 btn 찾기 결과:", btn);
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
            // audio-item이나 관련 버튼을 클릭한 경우는 제외
            if (event.target.closest('.audio-item') ||
                event.target.closest('.delete-audio-btn') ||
                event.target.closest('.add-audio-btn') ||
                event.target.closest('.selects-add-btn')) {
                return;
            }

            // 다른 곳을 클릭하면 선택 해제
            clearSelection();
        });
    }

    // 파일 유효성 검사 함수
    function validateAudioFile(file) {
        const maxSize = AUDIO_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE;
        if (file.size > maxSize) {
            showUploadError(`파일 크기가 ${(maxSize / (1024 * 1024)).toFixed(0)}MB를 초과합니다.`);
            return false;
        }

        const allowedTypes = AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_TYPES;
        const allowedExtensions = AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_EXTENSIONS;

        if (!allowedTypes.includes(file.type) && !file.name.match(new RegExp(`\\.(${allowedExtensions.join('|')})$`, 'i'))) {
            showUploadError("지원하지 않는 오디오 파일 형식입니다.");
            return false;
        }

        return true;
    }

    // 파일 업로드 함수
    async function uploadFileToServer(file) {
        try {
            const formData = new FormData();
            // AudioTimeline.js와 동일한 필드명 사용
            formData.append('audioFile', file);

            console.log("📤 업로드 요청 시작:", file.name);
            const response = await fetch(getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.UPLOAD), {
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

        uploadSection.appendChild(errorDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // 오디오 트랙 추가 성공 메시지 표시
    function showAddSuccess(audioName) {
        const existingMessage = soundPanel.querySelector(".add-success-message");
        if (existingMessage) existingMessage.remove();

        const successDiv = document.createElement("div");
        successDiv.className = "add-success-message";
        successDiv.innerHTML = `
      <div class="success-text">✅ "${audioName}" 오디오 트랙에 추가됨!</div>
      <div class="success-detail">오디오 타임라인에서 편집할 수 있습니다.</div>
    `;

        soundPanel.appendChild(successDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 5000);
    }

    // 오디오 트랙 추가 진행 상태 표시
    function showAddProgress(message) {
        const existingProgress = soundPanel.querySelector(".add-progress-message");
        if (existingProgress) existingProgress.remove();

        const progressDiv = document.createElement("div");
        progressDiv.className = "add-progress-message";
        progressDiv.innerHTML = `
      <div class="progress-text">🔄 ${message}</div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;

        soundPanel.appendChild(progressDiv);
    }

    // 오디오 트랙 추가 진행 상태 메시지 제거
    function clearAddProgress() {
        const existingProgress = soundPanel.querySelector(".add-progress-message");
        if (existingProgress) {
            existingProgress.remove();
            console.log("🧹 진행 상태 메시지 제거됨");
        }
    }

    // 오디오 트랙 추가 실패 메시지 표시
    function showAddError(audioName, errorMessage) {
        const existingMessage = soundPanel.querySelector(".add-error-message");
        if (existingMessage) existingMessage.remove();

        const errorDiv = document.createElement("div");
        errorDiv.className = "add-error-message";
        errorDiv.innerHTML = `
      <div class="error-text">❌ "${audioName}" 추가 실패: ${errorMessage}</div>
    `;

        soundPanel.appendChild(errorDiv);

        // 5초 후 제거
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // 선택된 파일들을 오디오 트랙에 추가하는 함수
    async function addSelectedFilesToAudioTimeline(selectedFiles) {
        try {
            console.log("🚀 선택된 파일들을 오디오 트랙에 추가 시작:", selectedFiles.length, "개");

            // 진행 상태 표시
            showAddProgress(`${selectedFiles.length}개 선택된 파일을 오디오 트랙에 추가 중...`);

            // 모든 파일을 순차적으로 오디오 트랙에 추가
            const results = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                const fileInfo = selectedFiles[i];
                console.log(`📁 파일 ${i + 1}/${selectedFiles.length} 추가 중:`, fileInfo.displayName);

                try {
                    // 진행 상태 업데이트
                    showAddProgress(`${fileInfo.displayName} 오디오 트랙에 추가 중... (${i + 1}/${selectedFiles.length})`);

                    // 오디오 트랙에 음악 추가
                    if (editor && editor.audioTimeline) {
                        // addAudioFromAsset 메서드 사용 (AudioTimeline.js에 구현됨)
                        if (editor.audioTimeline.addAudioFromAsset) {
                            console.log("🎯 addAudioFromAsset 메서드 호출 시도:", fileInfo.displayName);

                            // 파일 정보를 AudioTimeline이 기대하는 형식으로 변환
                            const audioFile = {
                                path: fileInfo.path,
                                name: fileInfo.filename,
                                displayName: fileInfo.displayName,
                                filename: fileInfo.filename
                            };

                            await editor.audioTimeline.addAudioFromAsset(audioFile);
                            results.push({ file: fileInfo.displayName, success: true });
                            console.log(`✅ ${fileInfo.displayName} 오디오 트랙에 추가 완료`);
                        } else {
                            throw new Error("AudioTimeline에 addAudioFromAsset 메서드가 없습니다.");
                        }
                    } else {
                        // 더 자세한 오류 정보 제공
                        if (!editor) {
                            throw new Error("editor 객체가 전달되지 않았습니다.");
                        } else if (!editor.audioTimeline) {
                            throw new Error("editor.audioTimeline이 초기화되지 않았습니다. AudioTimeline 컴포넌트가 로드되었는지 확인해주세요.");
                        }
                    }
                } catch (error) {
                    console.error(`❌ ${fileInfo.displayName} 오디오 트랙 추가 실패:`, error);
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
                showAddSuccess(`${successfulAdds.length}개 파일을 오디오 트랙에 성공적으로 추가했습니다!`);
                console.log("✅ 오디오 트랙에 추가된 파일들:", successfulAdds.map(r => r.file));
            }

            if (failedAdds.length > 0) {
                showAddError(`${failedAdds.length}개 파일 오디오 트랙 추가에 실패했습니다.`);
                console.error("❌ 오디오 트랙 추가 실패한 파일들:", failedAdds);
            }

            return { successful: successfulAdds.length, failed: failedAdds.length };

        } catch (error) {
            // 오류 발생 시에도 진행 상태 메시지 제거
            clearAddProgress();

            console.error("❌ 선택된 파일들을 오디오 트랙에 추가 중 오류:", error);
            showAddError(`파일 추가 중 오류: ${error.message}`);
            return { successful: 0, failed: selectedFiles.length };
        }
    }

    // 음악 목록 표시 함수
    async function displayAudioList() {
        const audioListContainer = soundPanel.querySelector('.audio-list-container');
        if (!audioListContainer) {
            console.error("❌ audioListContainer를 찾을 수 없습니다");
            return;
        }

        console.log("📋 기존 목록 제거 중...");
        // 기존 목록 제거
        audioListContainer.innerHTML = '';

        // 선택 상태 초기화
        clearSelection();

        try {
            console.log("📡 음악 파일 목록 로드 중...");
            const audioFiles = await loadAudioFilesFromFolder();
            console.log("📥 로드된 음악 파일 수:", audioFiles ? audioFiles.length : 0);

            if (!audioFiles || audioFiles.length === 0) {
                console.log("음악 파일이 없음 - 안내 메시지 표시");
                const noFilesMessage = document.createElement("div");
                noFilesMessage.className = "no-files-message";
                noFilesMessage.innerHTML = `
          <p>사용 가능한 음악 파일이 없습니다.</p>
          <p>files/music 폴더에 음악 파일을 추가해주세요.</p>
        `;
                audioListContainer.appendChild(noFilesMessage);
                return;
            }

            console.log("🔧 음악 목록 UI 생성 중...");
            audioFiles.forEach((audioFile, index) => {
                console.log(`음악 ${index + 1}:`, audioFile.displayName);

                const audioItem = document.createElement("div");
                audioItem.className = "audio-item";
                audioItem.dataset.filename = audioFile.filename || audioFile.name;
                audioItem.dataset.path =
                  audioFile.path ||
                  `../files/music/${audioFile.filename || audioFile.name}`;
                audioItem.innerHTML = `
          <div class="audio-info">
            <span class="audio-name">${audioFile.displayName}</span>
            <span class="audio-filename">${audioFile.filename || audioFile.name}</span>
          </div>
          <button class="add-audio-btn sb-dock-btn sb-dock-btn--icon" title="오디오 타임라인에 트랙 추가">
            <i class="fas fa-plus"></i>
          </button>
        `;

                // 음악 항목 클릭 이벤트 (토글 선택 지원)
                audioItem.addEventListener("click", (event) => {
                    // 버튼 클릭은 제외
                    if (event.target.closest('.add-audio-btn')) {
                        return;
                    }

                    // Ctrl/Cmd + 클릭으로 다중 선택/해제
                    if (event.ctrlKey || event.metaKey) {
                        event.preventDefault();

                        if (selectedAudioItems.has(audioItem)) {
                            // 이미 선택된 항목이면 선택 해제
                            selectedAudioItems.delete(audioItem);
                            audioItem.classList.remove('selected');
                            console.log("🎵 음악 항목 선택 해제됨:", audioFile.displayName);
                        } else {
                            // 새로 선택
                            selectedAudioItems.add(audioItem);
                            audioItem.classList.add('selected');
                            console.log("🎵 음악 항목 다중 선택됨:", audioFile.displayName);
                        }
                    } else {
                        // 일반 클릭으로 토글 선택
                        if (selectedAudioItems.has(audioItem)) {
                            // 이미 선택된 항목이면 선택 해제
                            selectedAudioItems.delete(audioItem);
                            audioItem.classList.remove('selected');
                            console.log("🎵 음악 항목 선택 해제됨:", audioFile.displayName);
                        } else {
                            // 새로 선택
                            selectedAudioItems.add(audioItem);
                            audioItem.classList.add('selected');
                            console.log("🎵 음악 항목 선택됨:", audioFile.displayName);
                        }
                    }

                    // 단일 선택 상태 업데이트 (휴지통 버튼용)
                    if (selectedAudioItems.size === 1) {
                        selectedAudioItem = Array.from(selectedAudioItems)[0];
                    } else {
                        selectedAudioItem = null;
                    }

                    updateButtons();
                });

                // 추가 버튼 클릭 이벤트
                const addBtn = audioItem.querySelector(".add-audio-btn");
                if (addBtn) {
                    console.log(`🔘 음악 ${index + 1}의 추가 버튼 이벤트 리스너 연결`);

                    // 중복 추가 방지를 위한 상태 추적
                    let isAdding = false;

                    addBtn.addEventListener("click", async(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (isAdding) {
                            console.log("이미 추가 중입니다...");
                            return;
                        }

                        console.log("🎵 오디오 트랙에 음악 추가 시작:", audioFile.displayName);

                        // 버튼 상태 변경
                        isAdding = true;
                        addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 추가 중...';
                        addBtn.disabled = true;
                        addBtn.classList.add('adding');

                        try {
                            // 디버깅 정보 출력
                            console.log("🔍 Editor 객체 상태 확인:");
                            console.log("  - editor 존재:", !!editor);
                            console.log("  - editor 타입:", typeof editor);
                            console.log("  - editor 키들:", editor ? Object.keys(editor) : "undefined");
                            console.log("  - audioTimeline 존재:", editor && !!editor.audioTimeline);
                            console.log("  - audioTimeline 타입:", editor && editor.audioTimeline ? typeof editor.audioTimeline : "undefined");
                            console.log("  - audioTimeline 키들:", editor && editor.audioTimeline ? Object.keys(editor.audioTimeline) : "undefined");

                            // 오디오 트랙에 음악 추가
                            if (editor && editor.audioTimeline) {
                                // addAudioFromAsset 메서드 사용 (AudioTimeline.js에 구현됨)
                                if (editor.audioTimeline.addAudioFromAsset) {
                                    console.log("🎯 addAudioFromAsset 메서드 호출 시도:", audioFile.displayName);
                                    await editor.audioTimeline.addAudioFromAsset(audioFile);
                                    console.log("✅ 오디오 트랙에 음악 추가 성공:", audioFile.displayName);

                                    // 성공 피드백
                                    showAddSuccess(audioFile.displayName);

                                    // 버튼을 체크 표시로 변경 (추가 완료 표시)
                                    addBtn.classList.remove('adding');
                                    addBtn.classList.add('success');
                                    addBtn.innerHTML = '<i class="fas fa-check"></i> 추가됨';

                                    // 3초 후 원래 상태로 복원
                                    setTimeout(() => {
                                        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                                        addBtn.classList.remove('success');
                                        addBtn.disabled = false;
                                        isAdding = false;
                                    }, 3000);

                                } else {
                                    throw new Error("AudioTimeline에 addAudioFromAsset 메서드가 없습니다.");
                                }
                            } else {
                                // 더 자세한 오류 정보 제공
                                if (!editor) {
                                    throw new Error("editor 객체가 전달되지 않았습니다.");
                                } else if (!editor.audioTimeline) {
                                    throw new Error("editor.audioTimeline이 초기화되지 않았습니다. AudioTimeline 컴포넌트가 로드되었는지 확인해주세요.");
                                }
                            }

                        } catch (error) {
                            console.error("❌ 오디오 트랙 추가 실패:", error);

                            // 오류 피드백
                            showAddError(audioFile.displayName, error.message);

                            // 버튼 상태 복원
                            addBtn.innerHTML = '<i class="fas fa-plus"></i>';
                            addBtn.classList.remove('adding');
                            addBtn.disabled = false;
                            isAdding = false;
                        }
                    });
                } else {
                    console.error(`❌ 음악 ${index + 1}의 추가 버튼을 찾을 수 없습니다`);
                }

                audioListContainer.appendChild(audioItem);
                console.log(`✅ 음악 ${index + 1} UI 항목 추가 완료`);
            });

            console.log("✅ 음악 목록 UI 생성 완료");

        } catch (error) {
            console.error("❌ 음악 목록 표시 실패:", error);
        }
    }

    // 전역 클릭 핸들러 설정
    setupGlobalClickHandler();

    // 초기 음악 목록 로드 (휴지통 버튼 생성 후)
    setTimeout(async() => {
        try {
            console.log("🚀 초기 음악 목록 로드 시작");
            await displayAudioList();
            console.log("✅ 초기 음악 목록 로드 완료");

            // 초기 선택 상태 표시 업데이트
            updateButtons();
        } catch (error) {
            console.error("❌ 초기 음악 목록 로드 실패:", error);
        }
    }, 100);

    return soundPanel;
}