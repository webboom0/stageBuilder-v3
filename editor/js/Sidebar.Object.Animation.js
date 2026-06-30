import {
  UIButton,
  UIDiv,
  UIText,
  UINumber,
  UIRow,
} from "./libs/ui.js";

function dedupeAnimations(animations) {
  const seen = new Set();
  return animations.filter((animation) => {
    const key = animation.uuid || animation.name || String(animation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function SidebarObjectAnimation(editor) {
  const strings = editor.strings;
  const signals = editor.signals;
  const mixer = editor.mixer;

  function getButtonText(action) {
    return action.isRunning()
      ? strings.getKey("sidebar/animations/stop")
      : strings.getKey("sidebar/animations/play");
  }

  function getButtonLabel(animation, action, totalCount) {
    const state = getButtonText(action);
    if (totalCount <= 1) return state;
    const name = (animation.name || "").trim();
    if (!name) return state;
    return `${name} · ${state}`;
  }

  function createAnimButton(animation, object, totalCount) {
    const action = mixer.clipAction(animation, object);
    const button = new UIButton(getButtonLabel(animation, action, totalCount));
    button.dom.classList.add("sb-anim-btn");
    if (animation.name) {
      button.dom.title = animation.name;
    }

    button.onClick(function () {
      if (action.isRunning()) {
        action.stop();
      } else {
        action.play();
      }
      button.setTextContent(getButtonLabel(animation, action, totalCount));
      button.dom.classList.toggle("is-playing", action.isRunning());
    });

    if (action.isRunning()) {
      button.dom.classList.add("is-playing");
    }

    return button;
  }

  const animationsList = new UIDiv();
  animationsList.dom.className = "sb-anim-buttons";

  const playRow = new UIRow();
  playRow.dom.classList.add("ec-row", "sb-anim-play-row");
  playRow.add(
    new UIText(strings.getKey("sidebar/animations")).setClass("Label"),
  );
  playRow.add(animationsList);

  signals.objectSelected.add(function (object) {
    if (object !== null && object.animations.length > 0) {
      animationsList.clear();

      const animations = dedupeAnimations(object.animations);
      for (const animation of animations) {
        animationsList.add(createAnimButton(animation, object, animations.length));
      }

      container.setDisplay("");
    } else {
      container.setDisplay("none");
    }
  });

  signals.objectRemoved.add(function (object) {
    if (object !== null && object.animations.length > 0) {
      mixer.uncacheRoot(object);
    }
  });

  const container = new UIDiv();
  container.dom.className = "sb-animations-block";
  container.setDisplay("none");
  container.add(playRow);

  const mixerTimeScaleRow = new UIRow();
  const mixerTimeScaleNumber = new UINumber(1)
    .setWidth("60px")
    .setRange(-10, 10);
  mixerTimeScaleNumber.onChange(function () {
    mixer.timeScale = mixerTimeScaleNumber.getValue();
  });

  mixerTimeScaleRow.add(
    new UIText(strings.getKey("sidebar/animations/timescale")).setClass(
      "Label",
    ),
  );
  mixerTimeScaleRow.add(mixerTimeScaleNumber);

  container.add(mixerTimeScaleRow);

  return container;
}

export { SidebarObjectAnimation };
