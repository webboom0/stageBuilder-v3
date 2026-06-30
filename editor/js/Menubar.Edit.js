import { Box3, Vector3 } from "three";

import { UIPanel, UIRow, UIHorizontalRule, UIText } from "./libs/ui.js";

import { AddObjectCommand } from "./commands/AddObjectCommand.js";
import { RemoveObjectCommand } from "./commands/RemoveObjectCommand.js";
import { SetPositionCommand } from "./commands/SetPositionCommand.js";
import { clone } from "../../examples/jsm/utils/SkeletonUtils.js";

const IS_MAC = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

function isShortcutInputField(target) {
  if (!target) return false;
  const tag = target.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable === true
  );
}

function bindUndoRedoShortcuts() {
  if (bindUndoRedoShortcuts._bound) return;
  bindUndoRedoShortcuts._bound = true;

  document.addEventListener("keydown", (event) => {
    if (document.querySelector(".project-setup-overlay")) return;
    if (isShortcutInputField(event.target)) return;

    const modKey = IS_MAC ? event.metaKey : event.ctrlKey;
    if (!modKey) return;

    const editor = window.editor;
    if (!editor?.undo || !editor?.redo) return;

    const key = event.key?.toLowerCase();

    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        editor.redo();
      } else {
        editor.undo();
      }
      return;
    }

    if (key === "y" && !event.shiftKey) {
      event.preventDefault();
      editor.redo();
    }
  });
}

function MenubarEdit(editor) {
  bindUndoRedoShortcuts();

  const strings = editor.strings;

  const container = new UIPanel();
  container.setClass("menu");

  const title = new UIPanel();
  title.setClass("title");
  title.setTextContent(strings.getKey("menubar/edit"));
  container.add(title);

  const options = new UIPanel();
  options.setClass("options");
  container.add(options);

  // Undo

  const undo = new UIRow();
  undo.setClass("option");
  undo.setTextContent(strings.getKey("menubar/edit/undo"));
  undo.add(new UIText("CTRL+Z").setClass("key"));
  undo.onClick(function () {
    editor.undo();
  });
  options.add(undo);

  // Redo

  const redo = new UIRow();
  redo.setClass("option");
  redo.setTextContent(strings.getKey("menubar/edit/redo"));
  redo.add(new UIText("CTRL+SHIFT+Z").setClass("key"));
  redo.onClick(function () {
    editor.redo();
  });
  options.add(redo);

  function onHistoryChanged() {
    const history = editor.history;

    undo.setClass("option");
    redo.setClass("option");

    if (history.undos.length == 0) {
      undo.setClass("inactive");
    }

    if (history.redos.length == 0) {
      redo.setClass("inactive");
    }
  }

  editor.signals.historyChanged.add(onHistoryChanged);
  onHistoryChanged();

  // ---

  options.add(new UIHorizontalRule());

  // Center

  let option = new UIRow();
  option.setClass("option");
  option.setTextContent(strings.getKey("menubar/edit/center"));
  option.onClick(function () {
    const object = editor.selected;

    if (object === null || object.parent === null) return; // avoid centering the camera or scene

    const aabb = new Box3().setFromObject(object);
    const center = aabb.getCenter(new Vector3());
    const newPosition = new Vector3();

    newPosition.x = object.position.x - center.x;
    newPosition.y = object.position.y - center.y;
    newPosition.z = object.position.z - center.z;

    editor.execute(new SetPositionCommand(editor, object, newPosition));
  });
  options.add(option);

  // Clone

  option = new UIRow();
  option.setClass("option");
  option.setTextContent(strings.getKey("menubar/edit/clone"));
  option.onClick(function () {
    let object = editor.selected;

    if (object === null || object.parent === null) return; // avoid cloning the camera or scene

    object = clone(object);

    editor.execute(new AddObjectCommand(editor, object));
  });
  options.add(option);

  // Delete

  option = new UIRow();
  option.setClass("option");
  option.setTextContent(strings.getKey("menubar/edit/delete"));
  option.add(new UIText("DEL").setClass("key"));
  option.onClick(function () {
    const object = editor.selected;

    if (object !== null && object.parent !== null) {
      editor.execute(new RemoveObjectCommand(editor, object));
    }
  });
  options.add(option);

  return container;
}

export { MenubarEdit };
