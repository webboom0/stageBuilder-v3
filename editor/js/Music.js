import { createCanvasElement } from "three";
import {
  UIPanel,
  UIRow,
  UIButton,
  UIText,
  UIInput,
  UINumber,
  UISelect,
} from "./libs/ui.js";

function Music({ ffmpeg, fetchFile }, _totalSeconds) {
  console.log("Music 들어옴");
  // FFmpeg 인스턴스와 fetchFile은 외부에서 전달받은 것을 사용
  const container = new UIPanel();
  container.setId("musicEdit");
  //   music controls
  const musicControls = new UIPanel();
  musicControls.setClass("music-controls");
  container.add(musicControls);
  //   file input
  const fileInput = new UIInput();
  fileInput.setId("fileInput");
  fileInput.setClass("fileInput");
  fileInput.dom.setAttribute("type", "file");
  fileInput.dom.setAttribute("accept", "audio/*");
  musicControls.add(fileInput);

  //   select box
  let musicSelect = new UISelect("select");
  musicSelect.setId("musicSelect");
  // musicControls.add(musicSelect);
  //   start time
  const startTimeUi = new UINumber();
  startTimeUi.setId("startTime");
  startTimeUi.dom.setAttribute("min", "0");
  startTimeUi.dom.setAttribute("readonly", "readonly");
  startTimeUi.dom.value = secondsToTime(0);
  musicControls.add(startTimeUi);
  //   end time
  const endTimeUi = new UINumber();
  endTimeUi.setId("endTime");
  endTimeUi.dom.setAttribute("min", "0");
  endTimeUi.dom.value = secondsToTime(0);
  endTimeUi.dom.setAttribute("readonly", "readonly");
  musicControls.add(endTimeUi);
  // Cut 버튼 생성
  const cutButton = new UIButton("Cut Audio");
  cutButton.setId("cutButton");
  cutButton.dom.classList.add("disabled");
  musicControls.add(cutButton);
  // Play 버튼 생성
  const playButton = new UIButton("Play");
  playButton.setId("playButton");
  playButton.dom.classList.add("disabled");
  musicControls.add(playButton);
  // Pause 버튼 생성
  // const pauseButton = new UIButton("");
  // pauseButton.setId("pauseButton");
  // pauseButton.dom.classList.add("button-3d", "disabled");
  // pauseButton.dom.innerHTML = '<i class="fas fa-pause"></i>';
  // pauseButton.dom.title = "Pause";
  // musicControls.add(pauseButton);
  // Stop 버튼 생성
  // const stopButton = new UIButton("Stop");
  // stopButton.setId("stopButton");
  // stopButton.dom.classList.add("disabled");
  // musicControls.add(stopButton);
  // 버튼 내용을 아이콘으로 변경
  cutButton.dom.innerHTML = '<i class="fas fa-cut"></i>';
  playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
  // stopButton.dom.innerHTML = '<i class="fas fa-stop"></i>';
  // pauseButton.dom.innerHTML = '<i class="fas fa-pause"></i>';

  // 버튼에 클래스 적용
  cutButton.dom.classList.add("button-3d", "cut-button");
  playButton.dom.classList.add("button-3d", "play-button");
  // stopButton.dom.classList.add("button-3d", "stop-button");
  // pauseButton.dom.classList.add("button-3d", "pause-button");

  // 툴크 추가 (마우스 오버시 설명 표시)
  cutButton.dom.title = "Cut Audio";
  playButton.dom.title = "Play";
  // stopButton.dom.title = "Stop";

  // const pauseButton = new UIButton("Pause");
  // pauseButton.setId("pauseButton");
  // musicControls.add(pauseButton);

  //   audio player
  const audioPlayer = document.createElement("audio");
  // audioPlayer.setAttribute("controls", "");
  audioPlayer.setAttribute("id", "audioPlayer");
  musicControls.dom.appendChild(audioPlayer);

  let audioContext;
  let audioBuffer; // 원본 오디오 버퍼
  let cutAudioBuffer; // cut된 오디오 버퍼
  let source;
  let analyser;
  let dataArray;
  let animationId;
  let data;
  let arrayBuffer;
  let isPlaying = false;
  let gainNode; // GainNode 생성
  let startTime = 0; // 재생 시작 시간
  let endTime = 0; // 마지막 시간
  let pausedAt = 0; // 일시정지된 시점의 시간을 저장
  let playStartTime = 0; // 실제 재생 시작 시간
  let audioStartOffset = 0; // 오디오 시작 위치
  let audioUrl;
  let musicFile;
  let Initializing = false;

  // 재생 상태를 저장할 변수들
  let audioState = {
    isPlaying: false,
    currentTime: 0,
    audioUrl: null,
    markerStartTime: 0,
    markerEndTime: 0,
    volume: 0.5,
  };
  const init = async function () {
    console.log("Musci.js init");
    console.log(editor.scene.userData.music);
    const musicData = editor.scene.userData.music;
    if (musicData) {
      Initializing = true;
      // audioUrl = musicData.audioUrl;
      musicFile = musicData.musicFile;
      const absoluteFilePath = `${window.location.origin}/${musicData.path}`;
      const fileName = musicData.name;
      const startTime = musicData.startTime;
      const endTime = musicData.endTime;

      filenameEl.textContent = getFileName(fileName);
      filenameEl.classList.add("flowing");

      // const fileName = musicFile.name;
      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load();
      }

      ffmpeg.FS("writeFile", fileName, await fetchFile(musicFile));

      await ffmpeg.run(
        "-i",
        fileName,
        "-ss",
        startTime,
        "-to",
        endTime,
        "-c",
        "copy",
        "output.mp3",
      );

      // data = ffmpeg.FS("readFile", "output.mp3");

      // Visualizer 초기화
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      fileFetch(absoluteFilePath, fileName);

      // 버튼 활성화
      // setEnabled.play();
      // setController(startTime, endTime);
    }
  };

  fileInput.dom.addEventListener("change", function (event) {
    console.log("fileInput@@@@@@@@@@@@@@@@@@");
    const file = event.target.files[0];
    Initializing = false;
    if (file) {
      audioUrl = URL.createObjectURL(file);
      console.log(audioUrl);
      filenameEl.textContent = getFileName(file.name);
      filenameEl.classList.add("flowing");
      if (isPlaying) {
        // 정지 (Stop) 로직
        stopPlayback();
        // 아이콘을 play로 변경
        playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
        playButton.dom.title = "Play";

        // 현재 시간 저장
        audioState.currentTime = audioContext.currentTime - playStartTime;
      }

      setDisabled.all(); // 버튼 비활성화
      loadMusic(file);
    }
  });
  // 방법 2: split 사용
  const getFileName = (path) => {
    // const filePath_encoding = encodeURIComponent(filePath);
    let filePath = decodeURIComponent(path);
    console.log("filePath");
    console.log(filePath);
    // %5Cfiles%5Cmusic%5CG-DRAGON%20-%20DRAMA%20(Official%20Video).mp3
    // %5Cfiles%5Cmusic%5CG-DRAGON%20-%20DRAMA%20(Official%20Video).mp3
    filePath = filePath.replaceAll("\\", "/");
    console.log(filePath);
    return filePath.substring(filePath.lastIndexOf("/") + 1);
  };
  // 옵션 설정
  function addMusicOptions(fileNames) {
    const options = { "": "select music" };
    let selectIdx;
    fileNames.forEach((fileName, idx) => {
      const name = getFileName(fileName);
      options[fileName] = name; // 키와 값을 동일하게 설정
      if (editor.scene.userData.music) {
        if (editor.scene.userData.music.name == name) {
          selectIdx = idx;
        }
      }
    });

    musicSelect.setOptions(options);
    if (editor.scene.userData.music) {
      console.log(`selectIdx ${selectIdx}`);
      musicSelect.dom
        .querySelectorAll("option")
        [selectIdx + 1].setAttribute("selected", true);
      // musicSelect.dom
      //   .querySelector(`option[value = ${editor.scene.userData.music.path}]`)
      //   .setAttribute("seelcted", true);
    }
  }

  // 서버에서 파일 목록을 가져와 옵션 추가
  function loadMusicFiles() {
    console.log("loadMusicFiles");
    fetch("/files/music") // 디렉토리 경로를 직접 요청
      .then((response) => response.text())
      .then((html) => {
        // HTML 파싱하여 파일 목록 추출
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const links = Array.from(doc.querySelectorAll("a"));
        const fileNames = links
          .map((link) => link.getAttribute("href"))
          .filter((fileName) => fileName.endsWith(".mp3"));
        console.log(fileNames);
        addMusicOptions(fileNames);
      })
      .catch((error) => {
        console.error("Error fetching music files:", error);
      });
  }
  // 파일 목록 로드
  // loadMusicFiles();

  // 셀렉트 박스 변경 이벤트
  musicSelect.dom.addEventListener("change", async function (event) {
    console.log("musicSelect change");
    console.log(isPlaying);
    Initializing = false;
    // progressBar.style.left = "0";
    // progressBar.style.width = "0";
    // startMarker.style.left = "0%";
    // endMarker.style.left = "0%";
    // cutButton.dom.classList.add("disabled");
    filenameEl.textContent = getFileName(musicSelect.getValue());
    filenameEl.classList.add("flowing");
    if (isPlaying) {
      // 정지 (Stop) 로직
      stopPlayback();
      // 아이콘을 play로 변경
      playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
      playButton.dom.title = "Play";

      // 현재 시간 저장
      audioState.currentTime = audioContext.currentTime - playStartTime;
    }

    const selectedIndex = musicSelect.dom.selectedIndex;
    const selectedOption = musicSelect.dom.options[selectedIndex];
    const selectedOptionTxt = selectedOption.text;
    const selectedFilePath = musicSelect.getValue();
    const absoluteFilePath = `${window.location.origin}/${selectedFilePath}`; // 절대 URL 생성
    fileFetch(absoluteFilePath, selectedOptionTxt);
    setDisabled.all(); // 버튼 비활성화
  });

  function fileFetch(absoluteFilePath, selectedOptionText) {
    console.log("fileFetch");
    console.log(absoluteFilePath);
    console.log(selectedOptionText);
    fetch(absoluteFilePath)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => {
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        musicFile = new File([blob], selectedOptionText, {
          type: "audio/mpeg",
        });
        console.log("musicFile!!!!!");
        console.log(musicFile);
        audioUrl = URL.createObjectURL(musicFile);
        loadMusic(); // loadMusic 함수 호출
      })
      .catch((error) => {
        console.error("Error loading file:", error);
      });
  }

  function loadMusic(file = null) {
    audioPlayer.src = audioUrl;
    console.log("loadMusic");
    console.log(audioPlayer);
    // editor.scene.userData.music에 오디오 정보 저장

    console.log("fileInput Change");
    console.log(editor.scene.userData.music);
    const reader = new FileReader();
    reader.onload = function (e) {
      console.log("onload");
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log(audioContext);
      audioContext.decodeAudioData(
        e.target.result,
        function (buffer) {
          audioBuffer = buffer; // audioBuffer에 디코딩된 오디오 데이터를 저장
          gainNode = audioContext.createGain(); // GainNode 생성
          gainNode.gain.value = 0.5; // 초기 볼륨 설정
          gainNode.connect(audioContext.destination); // GainNode를
          // musicData가 있는 경우 setController 호출
          const musicData = editor.scene.userData.music;
          if (musicData) {
            setController(musicData.startTime, musicData.endTime);
          } else {
            // 기본값으로 초기화
            setController(0, audioBuffer.duration);
          }
          /*
          // 프로그래스바 연결
          cutButton.dom.classList.remove("disabled");
          startMarker.style.left = "0%";
          endMarker.style.left = "100%";
          startTimeUi.dom.value = secondsToTime(0);
          endTimeUi.dom.value = secondsToTime(audioBuffer.duration);
          startText.textContent = secondsToTime(0);
          endText.textContent = secondsToTime(audioBuffer.duration);
          progressBar.max = audioBuffer.duration;
          progressBar.style.left = "0";
          progressBar.style.width = "100%";
          // startMarker.max = audioBuffer.duration;
          // endMarker.max = audioBuffer.duration;
          // endTime = audioBuffer.duration; // 초기 끝 시간을 전체 길이로 설정
*/

          // 파일 URL 저장
          audioState.audioUrl = URL.createObjectURL(musicFile);
          audioState.markerStartTime = 0;
          audioState.markerEndTime = audioBuffer.duration;

          // saveMusic(audioUrl, file, 0, audioBuffer.duration);
        },
        function (error) {
          console.error("Error decoding audio data", error);
        },
      );
    };
    if (file != null) {
      console.log("000000000000000000");
      musicFile = file;
    }
    reader.readAsArrayBuffer(musicFile);
  }
  cutButton.dom.addEventListener("click", async (e) => {
    console.log("cutButton click");
    console.log(musicFile);
    Initializing = false;
    if (e.currentTarget.classList.contains("disabled")) {
      return;
    }
    startTime = document.getElementById("startTime").value;
    endTime = document.getElementById("endTime").value;

    if (!musicFile) {
      alert("오디오 파일을 선택해주세요.");
      return;
    }

    if (!startTime || !endTime || startTime >= endTime) {
      alert("시작 시간과 종료 시간을 올바르게 입력해주세요.");
      return;
    }
    // const file = fileInput.dom.files[0];
    const fileName = musicFile.name;
    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    ffmpeg.FS("writeFile", fileName, await fetchFile(musicFile));

    await ffmpeg.run(
      "-i",
      fileName,
      "-ss",
      startTime,
      "-to",
      endTime,
      "-c",
      "copy",
      "output.mp3",
    );

    data = ffmpeg.FS("readFile", "output.mp3");
    console.log("data!!!!!!!!!!!!!!!!!!!!!!");
    console.log(ffmpeg);
    console.log(data);

    const audioBlob = new Blob([data.buffer], { type: "audio/mp3" });
    const audioUrl = URL.createObjectURL(audioBlob);
    audioPlayer.src = audioUrl;

    // 컨트롤러 세팅
    // setController();
    // setController(startTime, endTime);
    // cut한 구간만큼 progressBar 조정
    const markerStartTime = parseFloat(
      startTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
    );

    const markerEndTime = parseFloat(
      endTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
    );
    setController(markerStartTime, markerEndTime);
    // Visualizer 초기화
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    // 컷된 오디오 상태 저장
    audioState.audioUrl = audioUrl;
    audioState.markerStartTime = markerStartTime;
    audioState.markerEndTime = markerEndTime;
    audioState.markerEndTime = markerEndTime;

    saveMusic(audioUrl, fileName, markerStartTime, markerEndTime);

    // 버튼 활성화
    setEnabled.play();
  });

  playButton.dom.addEventListener("click", (e) => {
    if (e.currentTarget.classList.contains("disabled")) {
      return;
    }
    if (!isPlaying) {
      if (!data || !data.buffer) {
        // 마커만 이동한 경우 (컷하지 않은 상태)
        source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        const markerStartTime = parseFloat(
          startTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        );
        const markerEndTime = parseFloat(
          endTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        );

        const duration = markerEndTime - markerStartTime;

        // pause 상태에서 재생 시
        if (pausedAt > 0) {
          const elapsedTime = pausedAt - markerStartTime;
          playStartTime = audioContext.currentTime - elapsedTime;
          source.start(0, pausedAt, duration - (pausedAt - markerStartTime));
        } else {
          // 처음부터 재생
          playStartTime = audioContext.currentTime;
          source.start(0, markerStartTime, duration);
        }

        source.connect(gainNode);
        isPlaying = true;
        updateMarkerStyles();
        updateProgressBar();

        // 아이콘을 stop으로 변경
        playButton.dom.innerHTML = '<i class="fas fa-stop"></i>';
        playButton.dom.title = "Stop";

        // 현재 시간 저장
        audioState.currentTime = audioContext.currentTime - playStartTime;
      } else {
        // 컷된 오디오 재생
        arrayBuffer = data.buffer.slice(0);
        isPlaying = true;
        updateMarkerStyles();

        audioContext.decodeAudioData(
          arrayBuffer,
          function (buffer) {
            cutAudioBuffer = buffer;
            source = audioContext.createBufferSource();
            source.buffer = cutAudioBuffer;

            // analyser 노드 생성 및 연결
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);

            source.connect(analyser);
            analyser.connect(gainNode);

            // pause 상태에서 재생 시
            if (pausedAt > 0) {
              playStartTime = audioContext.currentTime - pausedAt;
              source.start(0, pausedAt);
            } else {
              // 처음부터 재생
              playStartTime = audioContext.currentTime;
              source.start(0);
            }

            source.onended = stopPlayback;
            draw();

            durationText.textContent = secondsToTime(audioBuffer.duration);
            updateProgressBar();

            // 아이콘을 stop으로 변경
            playButton.dom.innerHTML = '<i class="fas fa-stop"></i>';
            playButton.dom.title = "Stop";

            // 현재 시간 저장
            audioState.currentTime = audioContext.currentTime - playStartTime;
          },
          function (error) {
            console.error("오디오 디코딩 오류:", error);
          },
        );
      }
    } else {
      // 정지 (Stop) 로직
      stopPlayback();
      // 아이콘을 play로 변경
      playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
      playButton.dom.title = "Play";

      // 현재 시간 저장
      audioState.currentTime = audioContext.currentTime - playStartTime;
    }
  });

  // stopButton.dom.addEventListener("click", () => {
  //   if (isPlaying) {
  //     stopPlayback();
  //     // Stop 시 버튼을 play 상태로 복귀
  //     playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
  //     playButton.dom.title = "Play";
  //   }
  // });

  // pauseButton.dom.addEventListener("click", () => {
  //   console.log("pauseButton clicked");
  //   if (audioPlayer) {
  //     audioPlayer.pause(); // 오디오 일시정지
  //   }
  //   if (source) {
  //     source.stop();
  //     cancelAnimationFrame(animationId); // 애니메이션 중지
  //   }
  // });

  // 프로그레스바 컨테이너 생성
  const progressBarContainer = document.createElement("div");
  progressBarContainer.classList.add("progressBarContainer");
  progressBarContainer.style.position = "relative";
  progressBarContainer.style.width = "100%";
  progressBarContainer.style.height = "5px";
  progressBarContainer.style.borderRadius = "10px";
  progressBarContainer.style.backgroundColor = "#616161";
  progressBarContainer.style.margin = "0px 20px";
  musicControls.dom.appendChild(progressBarContainer);

  // 눈금 컨테이너 생성
  const ticksContainer = document.createElement("div");
  ticksContainer.style.position = "absolute";
  ticksContainer.style.width = "100%";
  ticksContainer.style.height = "10px";
  ticksContainer.style.top = "8px"; // progressBar 아래에 위치
  ticksContainer.style.left = "0";
  progressBarContainer.appendChild(ticksContainer);

  // 눈금 생성 함수
  function createTicks() {
    // 10개의 주 눈금과 각 주 눈금 사이에 4개의 보조 눈금
    const totalTicks = 100; // (10 - 1) * 5 + 1

    for (let i = 0; i < totalTicks; i++) {
      const tick = document.createElement("div");
      tick.style.position = "absolute";
      tick.style.width = i % 5 === 0 ? "1px" : "1px"; // 주 눈금은 더 굵게
      tick.style.height = i % 5 === 0 ? "5px" : "3px"; // 주 눈금은 더 길게
      tick.style.backgroundColor = i % 5 === 0 ? "#888" : "#666";
      tick.style.left = `${(i / (totalTicks - 1)) * 100}%`;
      tick.style.transform = "translateX(-50%)"; // 중앙 정렬
      ticksContainer.appendChild(tick);
    }
  }

  // 눈금 생성 함수 호출
  createTicks();

  // 프로그레스바 생성
  const progressBar = document.createElement("div");
  progressBar.classList.add("progressBar");
  progressBar.style.position = "absolute";
  progressBar.style.top = "0";
  progressBar.style.left = "0";
  progressBar.style.height = "100%";
  // progressBar.style.backgroundColor = "#ab4444";
  progressBar.style.background = "linear-gradient(90deg, #e1b166, #ab4444)";
  progressBar.style.zIndex = "1";
  progressBarContainer.appendChild(progressBar);

  // 시작 마커 생성
  const startMarker = document.createElement("div");
  startMarker.classList.add("startMarker");
  startMarker.style.position = "absolute";
  startMarker.style.top = "-6px";
  startMarker.style.width = "15px";
  startMarker.style.height = "15px";
  startMarker.style.borderRadius = "15px";
  startMarker.style.backgroundColor = "#e1b166";
  startMarker.style.cursor = "pointer";
  startMarker.style.zIndex = "2";
  progressBarContainer.appendChild(startMarker);

  // 끝 마커 생성
  const endMarker = document.createElement("div");
  endMarker.classList.add("endMarker");
  endMarker.style.position = "absolute";
  endMarker.style.top = "-6px";
  endMarker.style.width = "15px";
  endMarker.style.height = "15px";
  endMarker.style.borderRadius = "15px";
  endMarker.style.backgroundColor = "#ab4444";
  endMarker.style.cursor = "pointer";
  endMarker.style.zIndex = "2";
  progressBarContainer.appendChild(endMarker);

  const runningMusicBar = document.createElement("div");
  runningMusicBar.classList.add("runningMusicBar");
  runningMusicBar.style.position = "absolute";
  runningMusicBar.style.left = "50%";
  runningMusicBar.style.top = "30px";
  runningMusicBar.style.padding = "5px 10px";
  runningMusicBar.style.background = "#1a1a1a";
  runningMusicBar.style.borderRadius = "5px";
  runningMusicBar.style.transform = "translateX(-50%)";
  progressBarContainer.appendChild(runningMusicBar);

  const filenameBox = document.createElement("span");
  filenameBox.classList.add("filenameBox");
  runningMusicBar.appendChild(filenameBox);

  const filenameEl = document.createElement("span");
  filenameEl.classList.add("filename");
  filenameEl.textContent = "음악을 선택해주세요.";
  filenameEl.style.marginRight = "20px";
  filenameBox.appendChild(filenameEl);

  const currentTimeText = document.createElement("span");
  currentTimeText.classList.add("currentTimeText");
  currentTimeText.textContent = "00:00:00";
  runningMusicBar.appendChild(currentTimeText);

  const durationText = document.createElement("span");
  durationText.classList.add("durationText");
  durationText.textContent = "00:00";
  durationText.style.position = "absolute";
  durationText.style.right = "0";
  durationText.style.top = "25px";
  progressBarContainer.appendChild(durationText);

  const startText = document.createElement("span");
  startText.classList.add("startText");
  startText.textContent = "00:00";
  startText.style.position = "absolute";
  startText.style.left = "0";
  startText.style.top = "-20px";
  startText.style.fontSize = ".8em";
  startText.style.transform = "translateX(-50%)";
  startMarker.appendChild(startText);

  const endText = document.createElement("span");
  endText.classList.add("endText");
  endText.textContent = "00:00";
  endText.style.position = "absolute";
  endText.style.right = "0";
  endText.style.top = "-20px";
  endText.style.fontSize = ".8em";
  endText.style.transform = "translateX(50%)";
  endMarker.appendChild(endText);

  // 마커 드래그 기능
  function makeDraggable(marker, isStart) {
    let isDragging = false;

    marker.addEventListener("mousedown", (e) => {
      if (isPlaying) {
        return; // 재생 중에는 드래그 불가
      }
      isDragging = true;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || isPlaying) return; // 재생 중이거나 드래그 중이 아니면 리턴

      const rect = progressBarContainer.getBoundingClientRect();
      let newPosition =
        ((e.clientX - rect.left) / rect.width) * audioBuffer.duration;
      newPosition = Math.max(0, Math.min(newPosition, audioBuffer.duration));

      if (isStart) {
        const endTime = parseFloat(
          endTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        );
        if (newPosition < endTime) {
          startTime = newPosition;
          marker.style.left = `${(newPosition / audioBuffer.duration) * 100}%`;
          startTimeUi.dom.value = secondsToTime(startTime);
          startText.textContent = secondsToTime(startTime);
          progressBar.style.left = `${
            (startTime / audioBuffer.duration) * 100
          }%`;
          progressBar.style.width = `${
            ((endTime - startTime) / audioBuffer.duration) * 100
          }%`;
          // 마커가 이동되면 버튼 비활성화
          setDisabled.play();
        }
      } else {
        const startTime = parseFloat(
          startTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        );
        if (newPosition > startTime) {
          endTime = newPosition;
          marker.style.left = `${(newPosition / audioBuffer.duration) * 100}%`;
          endTimeUi.dom.value = secondsToTime(endTime);
          endText.textContent = secondsToTime(endTime);
          progressBar.style.width = `${
            ((endTime - startTime) / audioBuffer.duration) * 100
          }%`;
          // 마커가 이동되면 버튼 비활성화
          setDisabled.play();
        }
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // 마커 스타일 업데이트 함수 추가
  function updateMarkerStyles() {
    if (isPlaying) {
      startMarker.style.cursor = "not-allowed";
      endMarker.style.cursor = "not-allowed";
      // startMarker.style.opacity = "0.5";
      // endMarker.style.opacity = "0.5";
    } else {
      startMarker.style.cursor = "pointer";
      endMarker.style.cursor = "pointer";
      startMarker.style.opacity = "1";
      endMarker.style.opacity = "1";
    }
  }

  makeDraggable(startMarker, true);
  makeDraggable(endMarker, false);

  // 오디오 재생 및 프로그레스바 업데이트
  // function playAudio() {
  //   if (!isPlaying && audioBuffer) {
  //     source = audioContext.createBufferSource();
  //     source.buffer = audioBuffer;
  //     source.connect(gainNode);
  //     source.start(0, (startTime / 100) * audioBuffer.duration);
  //     isPlaying = true;
  //     updateProgressBar();
  //   }
  // }

  function updateProgressBar() {
    if (isPlaying) {
      const markerStartTime = parseFloat(
        startTimeUi.dom.value
          .split(":")
          .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
      );
      const markerEndTime = parseFloat(
        endTimeUi.dom.value
          .split(":")
          .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
      );

      const currentTime =
        audioContext.currentTime - playStartTime + markerStartTime;
      const duration = markerEndTime - markerStartTime;

      if (currentTime <= markerEndTime) {
        currentTimeText.textContent = secondsToTime(currentTime);
        // progressBar의 시작 위치와 너비를 계산
        const startPosition = (markerStartTime / audioBuffer.duration) * 100;
        const maxWidth =
          ((markerEndTime - markerStartTime) / audioBuffer.duration) * 100;
        const currentPosition =
          ((currentTime - markerStartTime) / duration) * maxWidth;

        progressBar.style.left = `${startPosition}%`;
        progressBar.style.width = `${currentPosition}%`;

        requestAnimationFrame(updateProgressBar);
      } else {
        stopPlayback();
      }
    }
  }

  /*
  function setController() {
    // cut한 구간만큼 progressBar 조정
    const markerStartTime = parseFloat(
      startTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0)
    );
    const markerEndTime = parseFloat(
      endTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0)
    );

    // progressBar만 조정하고 나머지는 원본 유지
    const startPosition = (markerStartTime / audioBuffer.duration) * 100;
    const width =
      ((markerEndTime - markerStartTime) / audioBuffer.duration) * 100;

    progressBar.style.left = `${startPosition}%`;
    progressBar.style.width = `${width}%`;

    // 원본 파일의 전체 길이 유지
    progressBarContainer.style.width = "100%";
    durationText.textContent = secondsToTime(audioBuffer.duration);
  }
*/
  function setController(startTime, endTime) {
    console.log("setController");
    console.log(startTime);
    console.log(endTime);
    // 시간 마커 위치 복원
    // startTime = audioState.markerStartTime;
    startTimeUi.dom.value = secondsToTime(startTime);
    startText.textContent = secondsToTime(startTime);
    startMarker.style.left = `${(startTime / audioBuffer.duration) * 100}%`;

    // endTime = audioState.markerEndTime;
    endTimeUi.dom.value = secondsToTime(endTime);
    endText.textContent = secondsToTime(endTime);
    endMarker.style.left = `${(endTime / audioBuffer.duration) * 100}%`;

    // 프로그레스바 업데이트
    const startPosition = (startTime / audioBuffer.duration) * 100;
    const width = ((endTime - startTime) / audioBuffer.duration) * 100;
    progressBar.style.left = `${startPosition}%`;
    progressBar.style.width = `${width}%`;

    // 총 재생 시간 표시 업데이트
    durationText.textContent = secondsToTime(audioBuffer.duration);
    if (Initializing) setEnabled.play();
    // 버튼 상태 업데이트
    if (audioBuffer) {
      // playButton.dom.classList.remove("disabled");
      cutButton.dom.classList.remove("disabled");
    }

    // 재생 상태 복원
    // isPlaying = audioState.isPlaying || false;
    if (isPlaying) {
      playButton.dom.innerHTML = '<i class="fas fa-pause"></i>';
      playButton.dom.title = "Pause";
    } else {
      playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
      playButton.dom.title = "Play";
    }
  }
  const setDisabled = {
    all: function () {
      console.log("setDisabled.all");
      playButton.dom.classList.add("disabled");
      progressBar.style.left = "0";
      progressBar.style.width = "0";
      startMarker.style.left = "0%";
      endMarker.style.left = "0%";
      cutButton.dom.classList.add("disabled");
    },
    play: function () {
      playButton.dom.classList.add("disabled");
    },
  };
  const setEnabled = {
    play: function () {
      playButton.dom.classList.remove("disabled");
    },
  };
  /*
  function disabledSetting() {
    playButton.dom.classList.add("disabled");
    progressBar.style.left = "0";
    progressBar.style.width = "0";
    startMarker.style.left = "0%";
    endMarker.style.left = "0%";
    cutButton.dom.classList.add("disabled");

    // stopButton.dom.classList.add("disabled");
    // fileInput.dom.disabled = true;
  }
*/

  // 원형 볼륨 컨트롤
  const volumeCanvas = document.createElement("canvas");
  volumeCanvas.width = 100;
  volumeCanvas.height = 100;
  musicControls.dom.appendChild(volumeCanvas);

  const volumeCtx = volumeCanvas.getContext("2d");
  let volume = 0.5; // 초기 볼륨
  audioPlayer.volume = volume; // 초기 볼륨 설정

  // MIN, MAX 텍스트 추가
  const minText = document.createElement("span");
  minText.textContent = "MIN";
  minText.style.position = "absolute";
  minText.style.left = "0";
  minText.style.bottom = "-20px";
  minText.style.fontSize = "12px";
  volumeCanvas.parentElement.appendChild(minText);

  const maxText = document.createElement("span");
  maxText.textContent = "MAX";
  maxText.style.position = "absolute";
  maxText.style.right = "0";
  maxText.style.bottom = "-20px";
  maxText.style.fontSize = "12px";
  volumeCanvas.parentElement.appendChild(maxText);

  function drawVolumeControl() {
    volumeCtx.clearRect(0, 0, volumeCanvas.width, volumeCanvas.height);

    // 외부 원 그라데이션
    const outerGradient = volumeCtx.createRadialGradient(
      45,
      45,
      35,
      50,
      50,
      40,
    );
    outerGradient.addColorStop(0, "#ffffff");
    outerGradient.addColorStop(1, "#333333");

    // 외부 원 그리기 (3D 효과)
    volumeCtx.beginPath();
    volumeCtx.arc(50, 50, 40, 0, 2 * Math.PI);
    volumeCtx.fillStyle = outerGradient;
    volumeCtx.fill();
    volumeCtx.strokeStyle = "#222";
    volumeCtx.lineWidth = 1;
    volumeCtx.stroke();

    // 눈금 그리기 (더 선명하게)
    for (let i = 0; i < 30; i++) {
      const angle = (i * Math.PI * 2) / 30;
      const startRadius = 35;
      const endRadius = i % 3 === 0 ? 28 : 32; // 눈금 길이 차이 더 크게

      const startX = 50 + Math.cos(angle) * startRadius;
      const startY = 50 + Math.sin(angle) * startRadius;
      const endX = 50 + Math.cos(angle) * endRadius;
      const endY = 50 + Math.sin(angle) * endRadius;

      volumeCtx.beginPath();
      volumeCtx.moveTo(startX, startY);
      volumeCtx.lineTo(endX, endY);
      volumeCtx.strokeStyle = "#222";
      volumeCtx.lineWidth = i % 3 === 0 ? 2 : 1; // 주요 눈금 더 굵게
      volumeCtx.stroke();
    }

    // 내부 원 그라데이션 (더 입체감 있게)
    const innerGradient = volumeCtx.createRadialGradient(
      45,
      45,
      15,
      50,
      50,
      28,
    );
    innerGradient.addColorStop(0, "#444444");
    innerGradient.addColorStop(1, "#000000");

    // 내부 검은색 원
    volumeCtx.beginPath();
    volumeCtx.arc(50, 50, 28, 0, 2 * Math.PI);
    volumeCtx.fillStyle = innerGradient;
    volumeCtx.fill();

    // 볼륨 표시 선 (더 선명하게)
    volumeCtx.beginPath();
    volumeCtx.arc(50, 50, 28, -Math.PI / 2, 2 * Math.PI * volume - Math.PI / 2);
    volumeCtx.strokeStyle = "#fff";
    volumeCtx.lineWidth = 3;
    volumeCtx.lineCap = "round"; // 선 끝을 둥글게
    volumeCtx.stroke();

    // 하이라이트 효과 (위쪽에 밝은 부분)
    volumeCtx.beginPath();
    volumeCtx.arc(50, 50, 38, -Math.PI / 2, Math.PI / 2);
    const highlightGradient = volumeCtx.createLinearGradient(50, 12, 50, 88);
    highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    volumeCtx.strokeStyle = highlightGradient;
    volumeCtx.lineWidth = 2;
    volumeCtx.stroke();
  }

  volumeCanvas.addEventListener("mousedown", (event) => {
    const rect = volumeCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left - 50;
    const y = event.clientY - rect.top - 50;
    const angle = Math.atan2(y, x) + Math.PI / 2;
    volume = (angle < 0 ? angle + 2 * Math.PI : angle) / (2 * Math.PI);
    gainNode.gain.value = volume;
    audioState.volume = volume; // 볼륨 상태 저장
    drawVolumeControl();
  });

  drawVolumeControl();

  // 시각화
  const visualizer = document.createElement("canvas");
  visualizer.setAttribute("id", "visualizer");
  visualizer.width = 100;
  visualizer.height = 100;
  // musicControls.dom.appendChild(visualizer);
  runningMusicBar.appendChild(visualizer);

  function startVisualizer() {
    if (audioBuffer) {
      if (source) {
        source.stop();
      }

      source = audioContext.createBufferSource();
      source.buffer = cutAudioBuffer;

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContext.destination);

      playStartTime = audioContext.currentTime;
      source.onended = stopPlayback;

      // cut된 오디오는 처음부터 끝까지 재생
      source.start(0);
      draw();
    }
  }

  function draw() {
    console.log("draw");
    const canvasCtx = visualizer.getContext("2d");
    animationId = requestAnimationFrame(draw);

    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = "rgb(0, 0, 0)";
    canvasCtx.fillRect(0, 0, visualizer.width, visualizer.height);

    const barWidth = (visualizer.width / dataArray.length) * 0.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      barHeight = dataArray[i];

      canvasCtx.fillStyle = "rgb(" + (barHeight + 100) + ",50,50)";
      canvasCtx.fillRect(
        x,
        visualizer.height - barHeight / 2,
        barWidth,
        barHeight / 2,
      );

      x += barWidth + 1;
    }
  }

  function drawGradientBarWaveform() {
    const canvasCtx = visualizer.getContext("2d");
    animationId = requestAnimationFrame(drawGradientBarWaveform);

    analyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);

    const barWidth = (visualizer.width / dataArray.length) * 0.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = dataArray[i] / 2;

      const gradient = canvasCtx.createLinearGradient(
        0,
        0,
        0,
        visualizer.height,
      );
      gradient.addColorStop(0, "#e30108");
      gradient.addColorStop(0.5, "#f719fd");
      gradient.addColorStop(1, "#01fbfc");

      canvasCtx.fillStyle = gradient;
      canvasCtx.fillRect(
        x,
        visualizer.height / 2 - barHeight / 2,
        barWidth,
        barHeight,
      );

      x += barWidth + 1;
    }
  }

  function secondsToTime(seconds) {
    // 음수 처리
    if (seconds < 0) {
      return "00:00:00";
    }

    // 시, 분, 초 계산
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    // 2자리 숫자로 포맷팅
    const formatNumber = (num) => num.toString().padStart(2, "0");

    // 결과 반환
    return `${formatNumber(hours)}:${formatNumber(minutes)}:${formatNumber(
      remainingSeconds,
    )}`;
  }

  function stopPlayback() {
    if (source) {
      source.stop();
    }
    isPlaying = false;
    pausedAt = 0; // 정지 시 일시정지 시간 초기화
    updateMarkerStyles();
    audioStartOffset = 0;
    currentTimeText.textContent = startTimeUi.dom.value;

    // 버튼을 play 상태로 복귀
    playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
    playButton.dom.title = "Play";

    // cut한 구간 유지
    const markerStartTime = parseFloat(
      startTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
    );
    const markerEndTime = parseFloat(
      endTimeUi.dom.value
        .split(":")
        .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
    );

    const startPosition = (markerStartTime / audioBuffer.duration) * 100;
    const width =
      ((markerEndTime - markerStartTime) / audioBuffer.duration) * 100;

    progressBar.style.left = `${startPosition}%`;
    progressBar.style.width = `${width}%`;

    cancelAnimationFrame(animationId);

    // 현재 시간 저장
    audioState.currentTime = audioContext.currentTime - playStartTime;
  }

  // editor에서 상태를 저장/복원하는 메서드를 container에 추가
  container.toJSON = function () {
    console.log("Music container toJSON called"); // 실행 시점 확인
    return {
      audioState: {
        isPlaying: isPlaying,
        currentTime: audioContext
          ? audioContext.currentTime - playStartTime
          : 0,
        audioUrl: audioPlayer.src,
        markerStartTime: parseFloat(
          startTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        ),
        markerEndTime: parseFloat(
          endTimeUi.dom.value
            .split(":")
            .reduce((acc, time) => 60 * acc + parseFloat(time), 0),
        ),
        volume: gainNode ? gainNode.gain.value : 0.5,
      },
    };
    console.log("Saving audio state:", state); // 저장되는 데이터 확인
    return state;
  };

  container.fromJSON = function (json) {
    if (json.audioState) {
      audioState = json.audioState;

      // 볼륨 상태 복원
      if (gainNode) {
        gainNode.gain.value = audioState.volume;
        volume = audioState.volume;
        drawVolumeControl(); // 볼륨 컨트롤 UI 업데이트
      }

      // 오디오 파일 URL이 있는 경우 로드
      if (audioState.audioUrl) {
        fetch(audioState.audioUrl)
          .then((response) => response.arrayBuffer())
          .then((arrayBuffer) => {
            audioContext.decodeAudioData(arrayBuffer).then((buffer) => {
              audioBuffer = buffer;
              cutAudioBuffer = buffer; // 초기 컷 버퍼도 설정

              // 파일명 업데이트
              const fileName = audioState.audioUrl.substring(
                audioState.audioUrl.lastIndexOf("/") + 1,
              );
              filenameEl.textContent = fileName;

              // 시간 마커 위치 복원
              if (audioState.markerStartTime !== undefined) {
                startTime = audioState.markerStartTime;
                startTimeUi.dom.value = secondsToTime(startTime);
                startText.textContent = secondsToTime(startTime);
                startMarker.style.left = `${
                  (startTime / audioBuffer.duration) * 100
                }%`;
              }

              if (audioState.markerEndTime !== undefined) {
                endTime = audioState.markerEndTime;
                endTimeUi.dom.value = secondsToTime(endTime);
                endText.textContent = secondsToTime(endTime);
                endMarker.style.left = `${
                  (endTime / audioBuffer.duration) * 100
                }%`;
              }

              // 프로그레스바 업데이트
              const startPosition = (startTime / audioBuffer.duration) * 100;
              const width =
                ((endTime - startTime) / audioBuffer.duration) * 100;
              progressBar.style.left = `${startPosition}%`;
              progressBar.style.width = `${width}%`;

              // 총 재생 시간 표시 업데이트
              durationText.textContent = secondsToTime(audioBuffer.duration);

              // 버튼 상태 업데이트
              if (audioBuffer) {
                playButton.dom.classList.remove("disabled");
                cutButton.dom.classList.remove("disabled");
              }

              // 재생 상태 복원
              isPlaying = audioState.isPlaying || false;
              if (isPlaying) {
                playButton.dom.innerHTML = '<i class="fas fa-pause"></i>';
                playButton.dom.title = "Pause";
              } else {
                playButton.dom.innerHTML = '<i class="fas fa-play"></i>';
                playButton.dom.title = "Play";
              }

              // 현재 시간 복원
              if (audioState.currentTime !== undefined) {
                currentTimeText.textContent = secondsToTime(
                  audioState.currentTime,
                );
              }

              updateMarkerStyles();
            });
          })
          .catch((error) => {
            console.error("Error loading audio:", error);
            filenameEl.textContent = "오디오 파일을 불러오는데 실패했습니다.";
          });
      }
    }
    console.log("Editor state:", json); // editor에 저장된 전체 데이터 확인
    return json;
  };

  function saveMusic(audioUrl, fileName, startTime, endTime) {
    if (!editor.scene.userData.music) {
      editor.scene.userData.music = {};
    }
    editor.scene.userData.music = {
      name: fileName,
      // path: musicSelect.getValue(),
      path: fileName,
      audioUrl: audioUrl,
      startTime: startTime,
      endTime: endTime,
      volume: 0.5, // 초기 볼륨 설정
    };
    if (!editor.scene.userData.music.fileInfo) {
      editor.scene.userData.music.fileInfo = {};
    }
    const reader = new FileReader();
    reader.onload = function (event) {
      const arrayBuffer = event.target.result;
      editor.scene.userData.music.fileInfo = {
        name: musicFile.name,
        size: musicFile.size,
        type: musicFile.type,
        lastModified: musicFile.lastModified,
        content: arrayBuffer, // 파일 내용을 ArrayBuffer로 저장
      };
      console.log(
        "File info saved with content:",
        editor.scene.userData.music.fileInfo,
      );
    };
    reader.readAsArrayBuffer(musicFile);

    console.log("saveMusic");
    console.log(editor.scene.userData.music);
  }
  init();
  return container;
}

export { Music };
