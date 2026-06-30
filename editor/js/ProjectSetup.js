// 프로젝트 설정 관련 기능들을 담은 모듈
export class ProjectSetup {
  constructor() {
    this.projectData = null;
  }


  // 새 프로젝트 시작 시 프로젝트 설정 팝업 표시
  showProjectSetupPopup(editor) {
    // 기존 팝업이 있다면 제거
    const existingPopup = document.querySelector('.project-setup-popup');
    if (existingPopup) {
      existingPopup.remove();
    }

    // 수정 모드인지 확인 (기존 프로젝트 정보가 있는지)
    const isEditMode = editor.project && Object.keys(editor.project).length > 0;

    // 팝업 오버레이 생성
    const overlay = document.createElement('div');
    overlay.className = 'project-setup-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
    `;

    // 팝업 컨테이너 생성
    const popup = document.createElement('div');
    popup.className = 'project-setup-popup';
    popup.style.cssText = `
      background: #2a2a2a;
      border-radius: 8px;
      padding: 30px;
      width: 500px;
      max-width: 90vw;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      border: 1px solid #444;
    `;

    // 팝업 헤더
    const header = document.createElement('div');
    header.style.cssText = `
      text-align: center;
      margin-bottom: 25px;
      border-bottom: 2px solid #444;
      padding-bottom: 15px;
    `;
    
    const title = document.createElement('h2');
    title.textContent = isEditMode ? '프로젝트 설정 수정' : '새 프로젝트 설정';
    title.style.cssText = `
      color: #fff;
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    `;
    
    const subtitle = document.createElement('p');
    subtitle.textContent = isEditMode ? '프로젝트 정보를 수정해주세요' : '프로젝트 기본 정보를 입력해주세요';
    subtitle.style.cssText = `
      color: #ccc;
      margin: 10px 0 0 0;
      font-size: 14px;
    `;
    
    header.appendChild(title);
    header.appendChild(subtitle);

    // 폼 생성
    const form = document.createElement('form');
    form.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    // 공연명 입력 필드
    const showNameContainer = document.createElement('div');
    showNameContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const showNameLabel = document.createElement('label');
    showNameLabel.textContent = '공연명';
    showNameLabel.style.cssText = `
      color: #fff;
      font-weight: 500;
      font-size: 14px;
    `;

    const showNameInput = document.createElement('input');
    showNameInput.type = 'text';
    showNameInput.name = 'showName';
    showNameInput.placeholder = '예: 로미오와 줄리엣';
    showNameInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.showName) {
      showNameInput.value = editor.project.showName;
    }
    showNameInput.style.cssText = `
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    // 포커스 효과
    showNameInput.addEventListener('focus', () => {
      showNameInput.style.borderColor = '#007acc';
    });

    showNameInput.addEventListener('blur', () => {
      showNameInput.style.borderColor = '#555';
    });

    showNameContainer.appendChild(showNameLabel);
    showNameContainer.appendChild(showNameInput);
    form.appendChild(showNameContainer);

    // 장르 입력 필드
    const genreContainer = document.createElement('div');
    genreContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const genreLabel = document.createElement('label');
    genreLabel.textContent = '장르';
    genreLabel.style.cssText = `
      color: #fff;
      font-weight: 500;
      font-size: 14px;
    `;

    const genreInput = document.createElement('input');
    genreInput.type = 'text';
    genreInput.name = 'genre';
    genreInput.placeholder = '예: 뮤지컬, 연극, 오페라';
    genreInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.genre) {
      genreInput.value = editor.project.genre;
    }
    genreInput.style.cssText = `
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    // 포커스 효과
    genreInput.addEventListener('focus', () => {
      genreInput.style.borderColor = '#007acc';
    });

    genreInput.addEventListener('blur', () => {
      genreInput.style.borderColor = '#555';
    });

    genreContainer.appendChild(genreLabel);
    genreContainer.appendChild(genreInput);
    form.appendChild(genreContainer);

    // 공연기간 입력 필드 (시작날짜 + 마지막날짜)
    const periodContainer = document.createElement('div');
    periodContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const periodLabel = document.createElement('label');
    periodLabel.textContent = '공연기간';
    periodLabel.style.cssText = `
      color: #fff;
      font-weight: 500;
      font-size: 14px;
    `;

    const periodInputsContainer = document.createElement('div');
    periodInputsContainer.style.cssText = `
      display: flex;
      gap: 10px;
      align-items: center;
    `;

    const startDateInput = document.createElement('input');
    startDateInput.type = 'date';
    startDateInput.name = 'startDate';
    startDateInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.startDate) {
      startDateInput.value = editor.project.startDate;
    }
    startDateInput.style.cssText = `
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    const endDateInput = document.createElement('input');
    endDateInput.type = 'date';
    endDateInput.name = 'endDate';
    endDateInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.endDate) {
      endDateInput.value = editor.project.endDate;
    }
    endDateInput.style.cssText = `
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    const periodSeparator = document.createElement('span');
    periodSeparator.textContent = '~';
    periodSeparator.style.cssText = `
      color: #ccc;
      font-size: 14px;
      font-weight: 500;
    `;

    // 포커스 효과
    [startDateInput, endDateInput].forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = '#007acc';
      });

      input.addEventListener('blur', () => {
        input.style.borderColor = '#555';
      });
    });

    periodInputsContainer.appendChild(startDateInput);
    periodInputsContainer.appendChild(periodSeparator);
    periodInputsContainer.appendChild(endDateInput);
    periodContainer.appendChild(periodLabel);
    periodContainer.appendChild(periodInputsContainer);
    form.appendChild(periodContainer);

    // 공연장소 입력 필드
    const venueContainer = document.createElement('div');
    venueContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const venueLabel = document.createElement('label');
    venueLabel.textContent = '공연장소/규모';
    venueLabel.style.cssText = `
      color: #fff;
      font-weight: 500;
      font-size: 14px;
    `;

    const venueInput = document.createElement('input');
    venueInput.type = 'text';
    venueInput.name = 'venue';
    venueInput.placeholder = '예: 예술의전당/규모: 소/중/대 극장';
    venueInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.venue) {
      venueInput.value = editor.project.venue;
    }
    venueInput.style.cssText = `
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    // 포커스 효과
    venueInput.addEventListener('focus', () => {
      venueInput.style.borderColor = '#007acc';
    });

    venueInput.addEventListener('blur', () => {
      venueInput.style.borderColor = '#555';
    });

    venueContainer.appendChild(venueLabel);
    venueContainer.appendChild(venueInput);
    form.appendChild(venueContainer);

    // 연출자/막 입력 필드
    const directorContainer = document.createElement('div');
    directorContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    const directorLabel = document.createElement('label');
    directorLabel.textContent = '연출자/막';
    directorLabel.style.cssText = `
      color: #fff;
      font-weight: 500;
      font-size: 14px;
    `;

    const directorInput = document.createElement('input');
    directorInput.type = 'text';
    directorInput.name = 'director';
    directorInput.placeholder = '예: 홍길동/1막';
    directorInput.required = true;
    // 수정 모드일 때 기존 값으로 미리 채우기
    if (isEditMode && editor.project.director) {
      directorInput.value = editor.project.director;
    }
    directorInput.style.cssText = `
      padding: 12px 16px;
      border: 1px solid #555;
      border-radius: 6px;
      background: #3a3a3a;
      color: #fff;
      font-size: 14px;
      transition: border-color 0.3s;
    `;

    // 포커스 효과
    directorInput.addEventListener('focus', () => {
      directorInput.style.borderColor = '#007acc';
    });

    directorInput.addEventListener('blur', () => {
      directorInput.style.borderColor = '#555';
    });

    directorContainer.appendChild(directorLabel);
    directorContainer.appendChild(directorInput);
    form.appendChild(directorContainer);


    // 버튼 컨테이너
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 15px;
      margin-top: 25px;
      justify-content: center;
    `;

    // 취소 버튼
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '취소';
    cancelBtn.style.cssText = `
      padding: 12px 24px;
      border: 1px solid #666;
      border-radius: 6px;
      background: transparent;
      color: #ccc;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.3s;
    `;

    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.borderColor = '#888';
      cancelBtn.style.color = '#fff';
    });

    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.borderColor = '#666';
      cancelBtn.style.color = '#ccc';
    });

    // 시작 버튼
    const startBtn = document.createElement('button');
    startBtn.type = 'submit';
    startBtn.textContent = isEditMode ? '프로젝트 수정' : '프로젝트 시작';
    startBtn.style.cssText = `
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      background: #007acc;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background 0.3s;
    `;

    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.background = '#005a9e';
    });

    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.background = '#007acc';
    });

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(startBtn);

    // 이벤트 핸들러
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });

    // 폼 제출 이벤트와 시작 버튼 클릭 이벤트 모두 처리
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

    // 팝업 조립
    popup.appendChild(header);
    popup.appendChild(form);
    popup.appendChild(buttonContainer);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // 첫 번째 입력 필드에 포커스
    const firstInput = popup.querySelector('input');
    if (firstInput) {
      firstInput.focus();
    }
  }

  // 프로젝트 설정 완료 성공 메시지
  showProjectSetupSuccess(showName, isEditMode = false) {
    const message = document.createElement('div');
    message.className = 'project-setup-success';
    message.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">✅</span>
        <span>"${showName}" 프로젝트가 ${isEditMode ? '수정되었습니다!' : '시작되었습니다!'}</span>
      </div>
    `;
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 15px 20px;
      border-radius: 6px;
      z-index: 10001;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideInRight 0.3s ease-out;
    `;

    // 애니메이션 CSS 추가
    if (!document.querySelector('#project-setup-animations')) {
      const style = document.createElement('style');
      style.id = 'project-setup-animations';
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(message);

    // 5초 후 자동 제거
    setTimeout(() => {
      if (message.parentNode) {
        message.remove();
      }
    }, 5000);
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
