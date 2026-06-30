import { UIPanel, UIBreak, UIRow, UIText } from "./libs/ui.js";
import { UIOutliner } from "./libs/ui.three.js";

function SidebarLight(editor) {
    const signals = editor.signals;

    const container = new UIPanel();
    container.setBorderTop("0");
    container.setPaddingTop("20px");

    // outliner
    const nodeStates = new WeakMap();

    function buildOption(object, draggable) {
        const option = document.createElement("div");
        option.draggable = draggable;
        option.innerHTML = buildHTML(object);
        option.value = object.id;

        // 드래그 이벤트
        if (draggable) {
            option.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("objectUuid", object.uuid);
                e.dataTransfer.setData("objectId", object.id);
                e.dataTransfer.setData("objectName", object.name);
            });
        }

        // opener (트리 펼치기/접기)
        if (nodeStates.has(object)) {
            const state = nodeStates.get(object);
            const opener = document.createElement("span");
            opener.classList.add("opener");
            if (object.children.length > 0) {
                opener.classList.add(state ? "open" : "closed");
            }
            opener.addEventListener("click", function () {
                nodeStates.set(object, nodeStates.get(object) === false); // toggle
                refreshUI();
            });
            option.insertBefore(opener, option.firstChild);
        }
        return option;
    }

    function buildHTML(object) {
        let html = `<span class="type Light"></span> ${escapeHTML(object.name)}`;
        return html;
    }

    function escapeHTML(html) {
        return html
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    let ignoreObjectSelectedSignal = false;

    const outliner = new UIOutliner(editor);
    outliner.setId("outliner-light");
    outliner.onChange(function () {
        ignoreObjectSelectedSignal = true;
        editor.selectById(parseInt(outliner.getValue()));
        ignoreObjectSelectedSignal = false;
    });
    outliner.onDblClick(function () {
        editor.focusById(parseInt(outliner.getValue()));
    });
    container.add(outliner);
    container.add(new UIBreak());

    function refreshUI() {
        const options = [];
        // 씬의 모든 Light/LightGroup만 트리로 추가
        function addLights(objects, pad) {
            for (let i = 0, l = objects.length; i < l; i++) {
                const object = objects[i];
                if (object.isLight || (object.isGroup && object.name.toLowerCase().includes("light"))) {
                    if (nodeStates.has(object) === false) {
                        nodeStates.set(object, false);
                    }
                    const option = buildOption(object, true);
                    option.style.paddingLeft = pad * 18 + "px";
                    options.push(option);

                    if (nodeStates.get(object) === true) {
                        if (object.isGroup && object.name.toLowerCase().includes("light")) {
                            // 그룹 하위 모두 추가
                            for (let j = 0; j < object.children.length; j++) {
                                const child = object.children[j];
                                const childOption = buildOption(child, true);
                                childOption.style.paddingLeft = (pad + 1) * 18 + "px";
                                options.push(childOption);
                                if (child.children && child.children.length > 0) {
                                    addLights(child.children, pad + 2);
                                }
                            }
                        } else if (object.isSpotLight && object.target) {
                            // SpotLight의 target도 하위로 추가
                            const targetOption = buildOption(object.target, true);
                            targetOption.style.paddingLeft = (pad + 1) * 18 + "px";
                            options.push(targetOption);
                            if (object.target.children && object.target.children.length > 0) {
                                addLights(object.target.children, pad + 2);
                            }
                        }
                    }
                }
            }
        }
        addLights(editor.scene.children, 0);
        outliner.setOptions(options);
        if (editor.selected !== null) {
            outliner.setValue(editor.selected.id);
        }
    }

    // 이벤트 연결
    signals.editorCleared.add(refreshUI);
    signals.sceneGraphChanged.add(refreshUI);
    signals.objectAdded.add(refreshUI);
    signals.objectRemoved.add(refreshUI);

    refreshUI();

    return container;
}

export { SidebarLight };