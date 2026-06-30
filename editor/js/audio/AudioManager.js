// editor/audio/AudioManager.js
class AudioManager {
  constructor(scene) {
    this.scene = scene;
    // audioTimeline에서 tracks 데이터 가져오기
    this.tracks = scene.userData.audioTimeline?.tracks || [];
  }

  addTrack(audioData) {
    const track = {
      id: this.tracks.length + 1,
      data: audioData,
      startTime: 0,
      duration: audioData.duration,
    };
    this.tracks.push(track);
    return track;
  }
}

export default AudioManager;
