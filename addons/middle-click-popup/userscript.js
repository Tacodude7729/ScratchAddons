export default async function ({ addon, msg, global, console }) {
  const Blockly = await addon.tab.traps.getBlockly();
  let mouse = { x: 0, y: 0 };

  class FloatingInput {
    constructor() {
      this.floatBar = null;
      this.floatInput = null;
      this.dropdownOut = null;
      this.dropdown = null;

      this.prevVal = "";

      this.DROPDOWN_BLOCK_LIST_MAX_ROWS = 25;

      this.createDom();
    }

    get workspace() {
      return Blockly.getMainWorkspace();
    }

    get selectedTab() {
      return addon.tab.redux.state.scratchGui.editorTab.activeTabIndex;
    }

    createDom() {
      // Popup new input box for block injection
      this.floatBar = document.body.appendChild(document.createElement("div"));
      this.floatBar.className = "sa-floatBar";
      this.floatBar.dir = addon.tab.direction;
      this.floatBar.style.display = "none";

      this.dropdownOut = this.floatBar.appendChild(document.createElement("div"));
      this.dropdownOut.className = "sa-floatBarDropdownOut";

      this.floatInput = this.dropdownOut.appendChild(document.createElement("input"));
      this.floatInput.className = "sa-floatBarInput";
      this.floatInput.className = addon.tab.scratchClass("input_input-form", {
        others: "sa-floatBarInput",
      });

      this.dropdown = this.dropdownOut.appendChild(document.createElement("ul"));
      this.dropdown.className = "sa-floatBarDropdown";

      this.floatInput.addEventListener("keyup", () => this.inputChange());
      this.floatInput.addEventListener("focus", () => this.inputChange());
      this.floatInput.addEventListener("keydown", (...e) => this.inputKeyDown(...e));
      this.floatInput.addEventListener("focusout", () => this.hide());

      this.dropdownOut.addEventListener("mousedown", (...e) => this.onClick(...e));

      document.addEventListener("keydown", (e) => {
        let ctrlKey = e.ctrlKey || e.metaKey;

        if (e.key === " " && ctrlKey) {
          // Ctrl + Space (Inject Code)
          this.show(e);
          e.cancelBubble = true;
          e.preventDefault();
          return true;
        }
      });
    }

    show(e) {
      if (this.selectedTab !== 0) {
        return;
      }

      e.cancelBubble = true;
      e.preventDefault();

      this.buildFilterList();

      this.floatBar.style.left = (e.clientX ?? mouse.x) + 16 + "px";
      this.floatBar.style.top = (e.clientY ?? mouse.y) - 8 + "px";
      this.floatBar.style.display = "";
      this.floatInput.focus();
    }

    onClick(e) {
      e.cancelBubble = true;
      if (!e.target.closest("input")) {
        e.preventDefault();
      }

      let sel = e && e.target;
      if (sel.tagName === "B") {
        sel = sel.parentNode;
      }

      if (e instanceof MouseEvent && sel.tagName !== "LI") {
        // Mouse clicks need to be on a block...
        return;
      }

      if (!sel || !sel.data) {
        sel = this.dropdown.querySelector(".sel");
      }

      if (!sel) {
        return;
      }

      let option = sel.data.option;
      // block:option.block, dom:option.dom, option:option.option
      if (option.option) {
        // We need to tweak the dropdown in this xml...
        let field = option.dom.querySelector("field[name=" + option.pickField + "]");
        if (field.getAttribute("id")) {
          field.innerText = option.option[0];
          field.setAttribute("id", option.option[1] + "-" + option.option[0]);
        } else {
          field.innerText = option.option[1]; // griffpatch - oops! option.option[1] not 0?
        }

        // Handle "stop other scripts in sprite"
        if (option.option[1] === "other scripts in sprite") {
          option.dom.querySelector("mutation").setAttribute("hasnext", "true");
        }
      }

      this.createDraggingBlock(option.dom, e, sel);

      if (e.shiftKey) {
        this.floatBar.style.display = "";
        this.floatInput.focus();
      }
    }

    createDraggingBlock(xml, e, sel) {
      // This is mostly copied from https://github.com/LLK/scratch-blocks/blob/893c7e7ad5bfb416eaed75d9a1c93bdce84e36ab/core/scratch_blocks_utils.js#L171
      // Some bits were removed or changed to fit our needs.
      this.workspace.setResizesEnabled(false);

      Blockly.Events.disable();
      try {
        var newBlock = Blockly.Xml.domToBlock(xml, this.workspace);

        Blockly.scratchBlocksUtils.changeObscuredShadowIds(newBlock);

        var svgRootNew = newBlock.getSvgRoot();
        if (!svgRootNew) {
          throw new Error("newBlock is not rendered.");
        }

        let blockBounds = newBlock.svgPath_.getBoundingClientRect();
        let newBlockX = Math.floor((mouse.x - (blockBounds.left + blockBounds.right) / 2) / this.workspace.scale);
        let newBlockY = Math.floor((mouse.y - (blockBounds.top + blockBounds.bottom) / 2) / this.workspace.scale);
        newBlock.moveBy(newBlockX, newBlockY);
      } finally {
        Blockly.Events.enable();
      }
      if (Blockly.Events.isEnabled()) {
        Blockly.Events.fire(new Blockly.Events.BlockCreate(newBlock));
      }

      var fakeEvent = {
        clientX: mouse.x,
        clientY: mouse.y,
        type: "mousedown",
        preventDefault: function () {
          e.preventDefault();
        },
        stopPropagation: function () {
          e.stopPropagation();
        },
        target: sel,
      };
      this.workspace.startDragWithFakeEvent(fakeEvent, newBlock);
    }

    inputChange() {
      // Filter the list...
      let val = (this.floatInput.value || "").toLowerCase();
      if (val === this.prevVal) {
        return;
      }

      this.prevVal = val;

      let p = this.dropdown.parentNode;
      this.dropdown.remove();

      let count = 0;

      let split = val.split(" ");
      let listLI = this.dropdown.getElementsByTagName("li");
      for (const li of listLI) {
        const procCode = li.data.text;
        const lower = li.data.lower;
        // let i = li.data.lower.indexOf(val);
        // let array = regExp.exec(li.data.lower);

        let im = 0;
        let match = [];
        for (let si = 0; si < split.length; si++) {
          let find = " " + split[si];
          let idx = lower.indexOf(find, im);
          if (idx === -1) {
            match = null;
            break;
          }
          match.push(idx);
          im = idx + find.length;
        }

        if (count < this.DROPDOWN_BLOCK_LIST_MAX_ROWS && match) {
          li.style.display = "block";
          while (li.firstChild) {
            li.removeChild(li.firstChild);
          }

          let i = 0;

          for (let iM = 0; iM < match.length; iM++) {
            let im = match[iM];
            if (im > i) {
              li.appendChild(document.createTextNode(procCode.substring(i, im)));
              i = im;
            }
            let bText = document.createElement("b");
            let len = split[iM].length;
            bText.appendChild(document.createTextNode(procCode.substr(i, len)));
            li.appendChild(bText);
            i += len;
          }

          if (i < procCode.length) {
            li.appendChild(document.createTextNode(procCode.substr(i)));
          }

          if (count === 0) {
            li.classList.add("sel");
          } else {
            li.classList.remove("sel");
          }
          count++;
        } else {
          li.style.display = "none";
          li.classList.remove("sel");
        }
      }
      p.append(this.dropdown);
    }

    inputKeyDown(e) {
      if (e.keyCode === 38) {
        this.navigateFloatFilter(-1);
        e.preventDefault();
        return;
      }
      if (e.keyCode === 40) {
        this.navigateFloatFilter(1);
        e.preventDefault();
        return;
      }
      if (e.keyCode === 13) {
        // Enter
        let sel = this.dropdown.querySelector(".sel");
        if (sel) {
          this.onClick(e);
          this.hide();
        }
        e.cancelBubble = true;
        e.preventDefault();
        return;
      }
      if (e.keyCode === 27) {
        // Escape
        if (this.floatInput.value.length > 0) {
          this.floatInput.value = ""; // Clear search first, then close on second press
          this.inputChange(e);
        } else {
          this.hide();
        }
        e.preventDefault();
        return;
      }
    }

    buildFilterList() {
      let options = [];

      let t = this.workspace.getToolbox();

      let blocks = t.flyout_.getWorkspace().getTopBlocks();
      // 107 blocks, not in order... but we can sort by y value or description right :)

      let fullDom = Blockly.Xml.workspaceToDom(t.flyout_.getWorkspace());
      const doms = {};
      for (const x of fullDom.children) {
        if (x.tagName === "BLOCK") {
          let id = x.getAttribute("id");
          doms[id] = x;
        }
      }

      for (const block of blocks) {
        this.getBlockText(block, options, doms);
      }

      options.sort((a, b) =>
        a.desc.length < b.desc.length ? -1 : a.desc.length > b.desc.length ? 1 : a.desc.localeCompare(b.desc)
      );

      let count = 0;

      while (this.dropdown.firstChild) {
        this.dropdown.removeChild(this.dropdown.firstChild);
      }
      for (const option of options) {
        const li = document.createElement("li");
        const desc = option.desc;

        // bType = hat block reporter boolean

        let bType = this.getEdgeTypeClass(option.block);

        count++;

        li.innerText = desc;
        li.data = { text: desc, lower: " " + desc.toLowerCase(), option: option };

        li.className =
          "sa-block-color-" + (option.block.isScratchExtension ? "pen" : option.block.getCategory()) + " sa-" + bType;
        if (count > this.DROPDOWN_BLOCK_LIST_MAX_ROWS) {
          // Limit maximum number of rows to prevent lag when no filter is applied
          li.style.display = "none";
        }
        this.dropdown.appendChild(li);
      }

      this.dropdownOut.classList.add("vis");
    }

    navigateFloatFilter(dir) {
      let sel = this.dropdown.getElementsByClassName("sel");
      let nxt;
      if (sel.length > 0 && sel[0].style.display !== "none") {
        nxt = dir === -1 ? sel[0].previousSibling : sel[sel.length - 1].nextSibling;
      } else {
        nxt = this.dropdown.children[0];
        dir = 1;
      }
      while (nxt && nxt.style.display === "none") {
        nxt = dir === -1 ? nxt.previousSibling : nxt.nextSibling;
      }
      if (nxt) {
        for (const i of sel) {
          i.classList.remove("sel");
        }
        nxt.classList.add("sel");
        // centerTop(nxt.data.labelID);
      }
    }

    getBlockText(block, options, doms) {
      // block.type;  "looks_nextbackdrop"

      let desc;
      let picklist, pickField;

      let dom = doms[block.id];

      // dom = doms[block.type];

      const process = (block) => {
        for (const input of block.inputList) {
          // input.name = "", input.type = 5
          let fields = input.fieldRow;
          for (const field of fields) {
            // field --- Blockly.FieldLabel .className = "blocklyText"
            // Blockly.FieldDropdown --- .className = "blocklyText blocklyDropdownText"

            let text;

            if (!picklist && field.className_ === "blocklyText blocklyDropdownText") {
              picklist = field.getOptions();
              pickField = field.name;
              if (picklist && picklist.length > 0) {
                text = "^^";
              } else {
                text = field.getText();
              }
            } else {
              text = field.getText();
            }

            desc = (desc ? desc + " " : "") + text;
          }

          if (input.connection) {
            let innerBlock = input.connection.targetBlock();
            if (innerBlock) {
              process(innerBlock); // Recursive process connected child blocks...
            }
          }
        }
      };

      process(block);

      if (picklist) {
        for (const item of picklist) {
          let code = item[1];
          if (
            typeof code !== "string" || // Audio Record is a function!
            code === "DELETE_VARIABLE_ID" ||
            code === "RENAME_VARIABLE_ID" ||
            code === "NEW_BROADCAST_MESSAGE_ID" ||
            code === "NEW_BROADCAST_MESSAGE_ID" ||
            // editor-searchable-dropdowns compatibility
            code === "createGlobalVariable" ||
            code === "createLocalVariable" ||
            code === "createGlobalList" ||
            code === "createLocalList" ||
            code === "createBroadcast"
          ) {
            continue; // Skip these
          }
          options.push({
            desc: desc.replace("^^", item[0]),
            block: block,
            dom: dom,
            option: item,
            pickField: pickField,
          });
        }
      } else {
        options.push({ desc: desc, block: block, dom: dom });
      }

      return desc;
    }

    getEdgeTypeClass(block) {
      switch (block.edgeShape_) {
        case 1:
          return "boolean";
        case 2:
          return "reporter";
        default:
          return block.startHat_ ? "hat" : "block";
      }
    }

    hide() {
      this.floatBar.style.display = "none";
    }
  }
  const floatingInput = new FloatingInput();

  const _doWorkspaceClick_ = Blockly.Gesture.prototype.doWorkspaceClick_;
  Blockly.Gesture.prototype.doWorkspaceClick_ = function () {
    if (!addon.self.disabled && (this.mostRecentEvent_.button === 1 || this.mostRecentEvent_.shiftKey)) {
      // Wheel button...
      floatingInput.show(this.mostRecentEvent_);
    }

    _doWorkspaceClick_.call(this);
  };

  document.addEventListener("mousemove", (e) => {
    mouse = { x: e.clientX, y: e.clientY };
  });
}
