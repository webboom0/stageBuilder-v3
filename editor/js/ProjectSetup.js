// 프로젝트 설정 관련 기능들을 담은 모듈
export class ProjectSetup {
  constructor() {
    this.projectData = null;
  }


  _createTextField(labelText, name, placeholder, value = "") {
    const wrap = document.createElement("div");
    wrap.className = "sb-project-field";
    const label = document.createElement("label");
    label.className = "sb-project-label";
    label.textContent = labelText;
    const input = document.createElement("input");
    input.className = "sb-project-input";
    input.type = "text";
    input.name = name;
    input.placeholder = placeholder;
    input.required = true;
    if (value) input.value = value;
    wrap.append(label, input);
    return wrap;
  }

  // 새 프로젝트 시작 시 프로젝트 설정 팝업 표시
  showProjectSetupPopup(editor) {
    document.querySelector(".project-setup-overlay")?.remove();

    const isEditMode = editor.project && Object.keys(editor.project).length > 0;
    const p = isEditMode ? editor.project : {};

    const overlay = document.createElement("div");
    overlay.className = "project-setup-overlay";

    const popup = document.createElement("div");
    popup.className = "project-setup-popup";

    const header = document.createElement("div");
    header.className = "sb-project-setup__header";
    const title = document.createElement("h2");
    title.className = "sb-project-setup__title";
    title.textContent = isEditMode ? "프로젝트 설정 수정" : "새 프로젝트 설정";
    const subtitle = document.createElement("p");
    subtitle.className = "sb-project-setup__subtitle";
    subtitle.textContent = isEditMode
      ? "프로젝트 정보를 수정해주세요"
      : "프로젝트 기본 정보를 입력해주세요";
    header.append(title, subtitle);

    const form = document.createElement("form");
    form.className = "sb-project-setup__form";
    form.noValidate = true;

    form.append(
      this._createTextField("공연명", "showName", "예: 로미오와 줄리엣", p.showName || ""),
      this._createTextField("장르", "genre", "예: 뮤지컬, 연극, 오페라", p.genre || ""),
    );

    const periodWrap = document.createElement("div");
    periodWrap.className = "sb-project-field";
    const periodLabel = document.createElement("label");
    periodLabel.className = "sb-project-label";
    periodLabel.textContent = "공연기간";
    const periodRow = document.createElement("div");
    periodRow.className = "sb-project-period";
    const startDateInput = document.createElement("input");
    startDateInput.className = "sb-project-input";
    startDateInput.type = "date";
    startDateInput.name = "startDate";
    startDateInput.required = true;
    if (p.startDate) startDateInput.value = p.startDate;
    const sep = document.createElement("span");
    sep.className = "sb-project-period__sep";
    sep.textContent = "~";
    const endDateInput = document.createElement("input");
    endDateInput.className = "sb-project-input";
    endDateInput.type = "date";
    endDateInput.name = "endDate";
    endDateInput.required = true;
    if (p.endDate) endDateInput.value = p.endDate;
    periodRow.append(startDateInput, sep, endDateInput);
    periodWrap.append(periodLabel, periodRow);
    form.append(periodWrap);

    form.append(
      this._createTextField(
        "공연장소/규모",
        "venue",
        "예: 예술의전당/규모: 소/중/대 극장",
        p.venue || "",
      ),
      this._createTextField("연출자/막", "director", "예: 홍길동/1막", p.director || ""),
    );

    const buttonContainer = document.createElement("div");
    buttonContainer.className = "sb-project-setup__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "sb-project-btn sb-project-btn--cancel";
    cancelBtn.textContent = "취소";

    const startBtn = document.createElement("button");
    startBtn.type = "submit";
    startBtn.className = "sb-project-btn sb-project-btn--primary";
    startBtn.textContent = isEditMode ? "프로젝트 수정" : "프로젝트 시작";

    buttonContainer.append(cancelBtn, startBtn);

    cancelBtn.addEventListener("click", () => overlay.remove());

    const handleProjectStart = async () => {
      console.log('🚀 프로젝트 시작 버튼 클릭됨!');
      
      try {
        // 폼 데이터 수집
        const formData = new FormData(form);
        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        
        const projectData = {
          showName: formData.get('showName'),
          genre: formData.get('genre'),
          startDate: startDate,
          endDate: endDate,
          showPeriod: `${startDate} ~ ${endDate}`, // 기존 호환성을 위한 필드
          venue: formData.get('venue'),
          director: formData.get('director'),
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        };

        console.log('📝 수집된 폼 데이터:', projectData);

        // 필수 필드 검증
        const requiredFields = ['showName', 'genre', 'startDate', 'endDate', 'venue', 'director'];
        const missingFields = requiredFields.filter(field => {
          const value = projectData[field];
          return !value || value.toString().trim() === '';
        });
        
        if (missingFields.length > 0) {
          const fieldLabels = {
            'showName': '공연명',
            'genre': '장르',
            'startDate': '시작날짜',
            'endDate': '마지막날짜',
            'venue': '공연장소/규모',
            'director': '연출자/막'
          };
          const missingLabels = missingFields.map(field => fieldLabels[field]).join(', ');
          alert(`다음 필드를 입력해주세요: ${missingLabels}`);
          return;
        }

        // 날짜 유효성 검증
        if (new Date(startDate) > new Date(endDate)) {
          alert('시작날짜는 마지막날짜보다 이전이어야 합니다.');
          return;
        }

        console.log('📝 프로젝트 데이터 수집 완료:', projectData);

        // editor.project 객체에 저장
        if (!editor.project) {
          editor.project = {};
        }
        
        Object.assign(editor.project, projectData);
        
        // 저장 확인
        if (!editor.project.showName || !editor.project.venue) {
          throw new Error('프로젝트 데이터 저장에 실패했습니다.');
        }
        
        console.log('💾 editor.project에 저장됨:', editor.project);
        
        // 로컬 스토리지에 프로젝트 정보 저장
        try {
          localStorage.setItem('stageBuilder_project', JSON.stringify(editor.project));
          console.log('💾 프로젝트 정보가 로컬 스토리지에 저장되었습니다.');
        } catch (error) {
          console.warn('로컬 스토리지 저장 실패:', error);
          // 로컬 스토리지 실패해도 계속 진행
        }
        
        console.log('🎭 프로젝트 설정 완료:', editor.project);
        
        // 성공 메시지 표시
        this.showProjectSetupSuccess(projectData.showName, isEditMode);
        
        // 팝업 제거
        console.log('🗑️ 팝업 제거 시작');
        overlay.remove();
        console.log('✅ 팝업 제거 완료');

        // 프로젝트 설정 완료 이벤트 발생
        const event = new CustomEvent('projectSetupComplete', {
          detail: { projectData: editor.project, editor: editor }
        });
        document.dispatchEvent(event);
        console.log('📡 projectSetupComplete 이벤트 발생됨');

        // 사이드바 새로고침 (프로젝트 정보 표시를 위해)
        if (window.refreshSidebar) {
          console.log('🔄 window.refreshSidebar 호출');
          window.refreshSidebar(editor);
        } else {
          console.log('🔄 수동 사이드바 새로고침 호출');
          // refreshSidebar가 없으면 수동으로 사이드바 업데이트
          // this.refreshSidebarManually(editor);
        }

      } catch (error) {
        console.error('❌ 프로젝트 설정 중 오류 발생:', error);
        alert(`프로젝트 설정 중 오류가 발생했습니다: ${error.message}`);
      }
    };

    // 폼 제출 이벤트
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('📝 폼 제출 이벤트 발생');
      handleProjectStart();
    });

    // 시작 버튼 클릭 이벤트 (추가 보안)
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔘 시작 버튼 클릭 이벤트 발생');
      handleProjectStart();
    });

    popup.append(header, form, buttonContainer);
    overlay.append(popup);
    document.body.appendChild(overlay);

    popup.querySelector("input")?.focus();
  }

  // 프로젝트 설정 완료 성공 메시지
  showProjectSetupSuccess(showName, isEditMode = false) {
    const message = document.createElement("div");
    message.className = "project-setup-success";
    message.textContent = `"${showName}" 프로젝트가 ${isEditMode ? "수정되었습니다!" : "시작되었습니다!"}`;
    document.body.appendChild(message);

    setTimeout(() => message.remove(), 5000);
  }

  // 새 프로젝트 시작 함수
  startNewProject(editor) {
    // 기존 프로젝트 정보가 있는지 확인
    const savedProject = this.loadProjectFromStorage();
    if (savedProject && Object.keys(savedProject).length > 0) {
      // 기존 프로젝트 정보가 있으면 확인 후 로드
      if (confirm('기존 프로젝트 정보가 있습니다. 새로 시작하시겠습니까?')) {
        // 로컬 스토리지에서 프로젝트 정보 제거
        localStorage.removeItem('stageBuilder_project');
        editor.project = {};
        this.showProjectSetupPopup(editor);
      } else {
        // 기존 프로젝트 정보 로드
        editor.project = savedProject;
        console.log('🎭 기존 프로젝트 정보 로드됨:', editor.project);
        
        // 프로젝트 로드 완료 이벤트 발생
        const event = new CustomEvent('projectLoadComplete', {
          detail: { projectData: editor.project, editor: editor }
        });
        document.dispatchEvent(event);
      }
    } else {
      // 새 프로젝트 시작
      this.showProjectSetupPopup(editor);
    }
  }

  // 로컬 스토리지에서 프로젝트 정보 불러오기
  loadProjectFromStorage() {
    try {
      const savedProject = localStorage.getItem('stageBuilder_project');
      if (savedProject) {
        return JSON.parse(savedProject);
      }
    } catch (error) {
      console.warn('로컬 스토리지에서 프로젝트 정보 불러오기 실패:', error);
    }
    return null;
  }

  // 프로젝트 정보 표시 함수
  showProjectInfo(editor) {
    if (!editor.project) {
      return null;
    }

    const projectInfoPanel = document.createElement('div');
    projectInfoPanel.className = 'project-info-panel';
    projectInfoPanel.style.cssText = `
      background: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      margin: 15px;
      border: 1px solid #444;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #444;
      padding-bottom: 15px;
    `;

    const title = document.createElement('h3');
    title.textContent = '🎭 프로젝트 정보';
    title.style.cssText = `
      color: #fff;
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    `;

    header.appendChild(title);

    const infoContainer = document.createElement('div');
    infoContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    const projectFields = [
      { key: 'showName', label: '공연명', icon: '🎭' },
      { key: 'genre', label: '장르', icon: '🎨' },
      { key: 'startDate', label: '시작날짜', icon: '📅' },
      { key: 'endDate', label: '마지막날짜', icon: '📅' },
      { key: 'venue', label: '공연장소/규모', icon: '🏛️' },
      { key: 'director', label: '연출자/막', icon: '🎬' }
    ];

    projectFields.forEach(field => {
      if (editor.project[field.key]) {
        const fieldDiv = document.createElement('div');
        fieldDiv.style.cssText = `
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: #3a3a3a;
          border-radius: 6px;
          border: 1px solid #555;
        `;

        const icon = document.createElement('span');
        icon.textContent = field.icon;
        icon.style.fontSize = '16px';

        const label = document.createElement('span');
        label.textContent = field.label + ':';
        label.style.cssText = `
          color: #ccc;
          font-weight: 500;
          min-width: 80px;
          font-size: 13px;
        `;

        const value = document.createElement('span');
        let displayValue = editor.project[field.key];
        
        // 날짜 형식 변환
        if (field.key === 'startDate' || field.key === 'endDate') {
          const date = new Date(displayValue);
          if (!isNaN(date.getTime())) {
            displayValue = date.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
          }
        }
        
        
        value.textContent = displayValue;
        value.style.cssText = `
          color: #fff;
          font-size: 13px;
          flex: 1;
        `;

        fieldDiv.appendChild(icon);
        fieldDiv.appendChild(label);
        fieldDiv.appendChild(value);
        infoContainer.appendChild(fieldDiv);
      }
    });

    // 프로젝트 수정 버튼
    const editButton = document.createElement('button');
    editButton.textContent = '프로젝트 정보 수정';
    editButton.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 15px;
      border: 1px solid #007acc;
      border-radius: 6px;
      background: transparent;
      color: #007acc;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.3s;
    `;

    editButton.addEventListener('mouseenter', () => {
      editButton.style.background = '#007acc';
      editButton.style.color = '#fff';
    });

    editButton.addEventListener('mouseleave', () => {
      editButton.style.background = 'transparent';
      editButton.style.color = '#007acc';
    });

    editButton.addEventListener('click', () => {
      this.showProjectSetupPopup(editor);
    });

    projectInfoPanel.appendChild(header);
    projectInfoPanel.appendChild(infoContainer);
    projectInfoPanel.appendChild(editButton);

    return projectInfoPanel;
  }

 
}

// 전역으로 함수 노출 (index.html에서 호출할 수 있도록)
window.ProjectSetup = ProjectSetup;
