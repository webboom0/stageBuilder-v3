/** 타임라인 재생 상태 (메인 Timeline + scene.userData) */
export function isTimelinePlaying(editor) {
  if (!editor) return false;
  if (editor.timeline?.isPlaying) return true;
  return !!editor.scene?.userData?.timeline?.isPlaying;
}

/** 편집·스크럽 시 재생 중이면 일시정지 */
export function pauseTimelineIfPlaying(editor) {
  if (!isTimelinePlaying(editor)) return false;
  const tl = editor.timeline || (typeof window !== "undefined" ? window.timeline : null);
  if (tl?.pause) {
    tl.pause();
    return true;
  }
  return false;
}
