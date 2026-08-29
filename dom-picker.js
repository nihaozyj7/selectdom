/*!
 * SelectDom · 任意网页 DOM 选择器
 *
 * 功能：
 *   注入任意网页后，出现悬浮面板。面板顶栏（复制全部/清空/选择元素 一行）可拖动，
 *   拖到屏幕左右边缘（10px 阈值内）会吸附并贴边隐藏成一窄条，悬停即展开；拖到中间则停在原处。
 *   点击「选择元素」进入选择模式：鼠标悬停高亮目标元素，点击将其加入已选列表。
 *   已选元素在页面上保持高亮（叠加元素用不同颜色），右上角有评论图标，点击可弹层编辑用户建议。
 *   面板中可移除单个元素、清空列表，并可复制「选择器 / DOM结构 / 用户建议」模板或唯一 CSS 选择器。
 *   Esc 或再次点击「退出选择」退出选择模式。
 *
 * 用法一（<script> 引入）：
 *   <script src="dom-picker.js"></script>
 *
 * 用法二（书签小工具）：
 *   新建书签，网址填入：javascript: 后接本文件全部内容（本文件即为 IIFE，
 *   可直接执行；若地址过长被浏览器拒绝，可先压缩成一行再粘贴）。
 *
 * 卸载：调用 window.__selectDomCleanup() 可移除界面并恢复原状；刷新页面亦可。
 * 提示：iframe 内元素不可选；Shadow DOM 内元素可复制 HTML，但无法生成穿透选择器。
 */
(function () {
  'use strict';

  var IDLE = 'idle';
  var SELECTING = 'selecting';
  var APP_ATTR = 'data-dp-app';

  var state = IDLE;
  var selected = new Set(); // 按插入顺序保存已选元素
  var rowMap = new WeakMap(); // 元素 -> 列表行节点
  var noteMap = new WeakMap(); // 元素 -> 用户建议输入框
  var lastHovered = null;
  var toastTimer = null;
  var rafPending = false;
  var markerRafPending = false;

  // 持久高亮与评论标记
  var PALETTE = ['#ff6600', '#1a73e8', '#0f9d58', '#e91e63', '#7b1fa2', '#f9ab00'];
  var outlineBackup = new WeakMap(); // 元素 -> 原内联 outline {value, priority}
  var markerMap = new WeakMap(); // 元素 -> { marker, bubble }
  var markerLayerEl, popupEl, popupTextareaEl, popupTarget = null;

  // 面板拖动与贴边状态
  var panelX = null, panelY = null; // 面板左上角坐标（null = 尚未接管定位）
  var snappedEdge = null; // 'left' | 'right' | null
  var dragging = false, dragMoved = false, panelHovered = false;
  var dragStartX = 0, dragStartY = 0, dragStartPanelX = 0, dragStartPanelY = 0;

  var styleEl, toggleBtn, overlayEl, panelEl, toolbarEl, headEl, listEl, countEl, collapseBtn, bodyWrapEl, emptyEl, toastEl;

  /* ---------- 工具 ---------- */

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function cssEscape(s) {
    if (window.CSS && typeof CSS.escape === 'function') return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\' + c; });
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // 复制模板：选择器 / DOM结构（顶层结构）/ 用户建议（填了才输出）
  function formatItem(el) {
    var lines = ['选择器: ' + (buildSelector(el) || '（无选择器）')];
    lines.push('DOM结构: ' + topLevelHTML(el));
    var note = noteMap.get(el);
    var noteText = note ? note.value.trim() : '';
    if (noteText) lines.push('用户建议: ' + noteText);
    return lines.join('\n');
  }

  // 仅顶层标签与属性，不含子内容；剔除注入的高亮 outline，还原原始 inline outline
  function topLevelHTML(el) {
    var clone = el.cloneNode(false);
    var backup = outlineBackup.get(el);
    if (backup) clone.style.setProperty('outline', backup.value, backup.priority);
    else clone.style.removeProperty('outline');
    if (!clone.getAttribute('style')) clone.removeAttribute('style');
    return clone.outerHTML;
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('dp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('dp-show'); }, 1500);
  }

  function isOurUI(el) {
    return el && el.nodeType === 1 && !!el.closest('[' + APP_ATTR + ']');
  }

  /* ---------- 样式 ---------- */

  function initStyles() {
    styleEl = document.createElement('style');
    styleEl.textContent = [
      '.dp-panel{all:initial;position:fixed!important;right:12px!important;top:12px!important;z-index:2147483647!important;display:flex;flex-direction:column;width:320px;max-height:44vh;background:#fff;color:#333;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;overflow:hidden;transition:transform .25s ease;will-change:transform}',
      '.dp-panel.dp-dragging{transition:none;box-shadow:0 8px 24px rgba(0,0,0,.3)}',
      '.dp-panel.dp-left.dp-collapsed{transform:translateX(calc(-100% + 16px))}',
      '.dp-panel.dp-right.dp-collapsed{transform:translateX(calc(100% - 16px))}',
      '.dp-toolbar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #eee;background:#fafafa;touch-action:none;user-select:none}',
      '.dp-toggle-mode{all:initial;margin-left:auto;padding:6px 14px;background:#ff6600;color:#fff;border:none;border-radius:20px;font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;white-space:nowrap}',
      '.dp-toggle-mode:hover{filter:brightness(1.1)}',
      '.dp-toggle-mode:active{filter:brightness(.95)}',
      '.dp-note{all:initial;box-sizing:border-box;display:block;width:100%;margin-top:5px;padding:3px 6px;border:1px solid #ddd;border-radius:4px;font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#333;background:#fff}',
      '.dp-note:focus{outline:none;border-color:#ff6600}',
      '.dp-note-badge{color:#ff6600;font-size:11px;margin-left:6px;font-weight:600}',
      '.dp-marker-layer{all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483645}',
      '.dp-marker{position:absolute;pointer-events:auto}',
      '.dp-marker-btn{all:initial;position:relative;display:inline-block;padding:2px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;color:#333;font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap}',
      '.dp-marker-btn:hover{background:#f5f5f5}',
      '.dp-marker.dp-outside .dp-marker-btn::after{content:"";position:absolute;top:100%;left:50%;margin-left:-5px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #ccc}',
      '.dp-bubble{all:initial;position:absolute;bottom:calc(100% + 5px);right:0;display:block;max-width:180px;padding:3px 8px;border-radius:8px;background:#fff;color:#333;border:1px solid #ddd;box-shadow:0 1px 6px rgba(0,0,0,.15);font:11px/1.4 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.dp-bubble::after{content:"";position:absolute;top:100%;right:12px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid #fff}',
      '.dp-popup{all:initial;position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%);z-index:2147483647!important;display:none;width:280px;background:#fff;color:#333;border:1px solid #ddd;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;padding:10px}',
      '.dp-popup textarea{all:initial;box-sizing:border-box;display:block;width:100%;min-height:60px;padding:6px 8px;border:1px solid #ddd;border-radius:4px;font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#333;background:#fff;resize:vertical}',
      '.dp-popup textarea:focus{outline:none;border-color:#ff6600}',
      '.dp-popup-btns{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}',
      '.dp-panel-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fff;border-bottom:1px solid #eee;cursor:move;user-select:none;touch-action:none}',
      '.dp-panel-head .dp-count{flex:1;font-weight:600}',
      '.dp-collapse-btn{all:initial;color:#666;font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;padding:1px 6px}',
      '.dp-collapse-btn:hover{color:#333}',
      '.dp-panel-body{display:flex;flex-direction:column;overflow:hidden}',
      '.dp-list{overflow:auto;flex:1;min-height:0}',
      '.dp-empty{padding:14px 10px;color:#999;text-align:center}',
      '.dp-row{padding:6px 10px;border-bottom:1px solid #f0f0f0}',
      '.dp-row-summary{font-weight:600;word-break:break-all}',
      '.dp-row-html{color:#999;font:11px/1.4 Consolas,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
      '.dp-row-btns{display:flex;gap:4px;margin-top:5px}',
      '.dp-mini{all:initial;padding:2px 8px;border:1px solid #ccc;border-radius:4px;background:#f7f7f7;color:#333;font:12px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer}',
      '.dp-mini:hover{background:#eee}',
      '.dp-mini.dp-primary{background:#ff6600;border-color:#ff6600;color:#fff}',
      '.dp-mini.dp-primary:hover{background:#e65c00}',
      '.dp-mini.dp-danger{color:#e33;border-color:#f3c1c1}',
      '.dp-mini.dp-danger:hover{background:#fdeaea}',
      '.dp-toast{all:initial;position:fixed!important;top:16px!important;left:50%!important;z-index:2147483647!important;display:block;width:max-content;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:6px 16px;border-radius:16px;font:12px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;pointer-events:none;opacity:0;transition:opacity .2s}',
      '.dp-toast.dp-show{opacity:1}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ---------- UI 创建 ---------- */

  function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.setAttribute(APP_ATTR, '');
    overlayEl.style.cssText = 'position:fixed!important;z-index:2147483646!important;pointer-events:none!important;display:none;box-sizing:border-box;border:2px dashed #ff6600;background:rgba(255,102,0,.12);border-radius:2px';
    document.body.appendChild(overlayEl);
  }

  function makeMiniBtn(text, kind, onClick) {
    var b = document.createElement('button');
    b.className = 'dp-mini' + (kind ? ' dp-' + kind : '');
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.setAttribute(APP_ATTR, '');
    panelEl.className = 'dp-panel';

    // 顶部工具栏：复制全部 / 清空 /（选择元素 ⇄ 退出选择）；该行同时是拖拽手柄
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'dp-toolbar';
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'dp-toggle-mode';
    toggleBtn.textContent = '选择元素';
    toggleBtn.title = '点击进入/退出 DOM 选择模式';
    toggleBtn.addEventListener('click', function () {
      setState(state === IDLE ? SELECTING : IDLE);
    });
    toolbarEl.append(
      makeMiniBtn('复制全部', 'primary', copyAll),
      makeMiniBtn('清空', '', clearAll),
      toggleBtn
    );
    toolbarEl.addEventListener('pointerdown', onDragStart);

    // 头部：计数 + 折叠按钮
    headEl = document.createElement('div');
    headEl.className = 'dp-panel-head';
    countEl = document.createElement('span');
    countEl.className = 'dp-count';
    countEl.textContent = '已选元素(0)';
    collapseBtn = document.createElement('button');
    collapseBtn.className = 'dp-collapse-btn';
    collapseBtn.textContent = '收起';
    collapseBtn.addEventListener('click', function () {
      var collapsed = bodyWrapEl.style.display === 'none';
      bodyWrapEl.style.display = collapsed ? 'flex' : 'none';
      collapseBtn.textContent = collapsed ? '收起' : '展开';
    });
    headEl.append(countEl, collapseBtn);

    panelEl.addEventListener('mouseenter', function () { panelHovered = true; updateCollapsed(); });
    panelEl.addEventListener('mouseleave', function () { panelHovered = false; updateCollapsed(); });
    window.addEventListener('resize', onPanelResize);

    bodyWrapEl = document.createElement('div');
    bodyWrapEl.className = 'dp-panel-body';
    listEl = document.createElement('div');
    listEl.className = 'dp-list';
    emptyEl = document.createElement('div');
    emptyEl.className = 'dp-empty';
    emptyEl.textContent = '暂无已选元素，点击「选择元素」开始拾取';
    listEl.appendChild(emptyEl);
    bodyWrapEl.appendChild(listEl);

    panelEl.append(toolbarEl, headEl, bodyWrapEl);
    document.body.appendChild(panelEl);
  }

  function createToast() {
    toastEl = document.createElement('div');
    toastEl.setAttribute(APP_ATTR, '');
    toastEl.className = 'dp-toast';
    document.body.appendChild(toastEl);
  }

  /* ---------- 持久高亮 ---------- */

  function colorForIndex(i) { return PALETTE[i % PALETTE.length]; }

  function applyHighlight(el, i) {
    if (!outlineBackup.has(el)) {
      outlineBackup.set(el, {
        value: el.style.getPropertyValue('outline'),
        priority: el.style.getPropertyPriority('outline')
      });
    }
    el.style.setProperty('outline', '2px solid ' + colorForIndex(i), 'important');
  }

  function clearHighlight(el) {
    var backup = outlineBackup.get(el);
    if (backup) {
      el.style.setProperty('outline', backup.value, backup.priority);
      outlineBackup.delete(el);
    }
  }

  function refreshHighlights() {
    var i = 0;
    selected.forEach(function (el) { applyHighlight(el, i++); });
  }

  /* ---------- 评论标记层与弹层 ---------- */

  function createMarkerLayer() {
    markerLayerEl = document.createElement('div');
    markerLayerEl.setAttribute(APP_ATTR, '');
    markerLayerEl.className = 'dp-marker-layer';
    document.body.appendChild(markerLayerEl);
  }

  function createMarker(el) {
    if (markerMap.has(el)) return;
    var marker = document.createElement('div');
    marker.setAttribute(APP_ATTR, '');
    marker.className = 'dp-marker';

    var btn = document.createElement('button');
    btn.setAttribute(APP_ATTR, '');
    btn.className = 'dp-marker-btn';
    btn.textContent = '✏️评论';
    btn.title = '点击编辑用户建议';
    btn.addEventListener('click', function (e) { e.stopPropagation(); openPopup(el); });

    var bubble = document.createElement('div');
    bubble.setAttribute(APP_ATTR, '');
    bubble.className = 'dp-bubble';
    bubble.style.display = 'none';
    bubble.addEventListener('click', function (e) { e.stopPropagation(); openPopup(el); });

    marker.appendChild(btn);
    marker.appendChild(bubble);
    markerLayerEl.appendChild(marker);
    markerMap.set(el, { marker: marker, btn: btn, bubble: bubble });
  }

  function removeMarker(el) {
    var m = markerMap.get(el);
    if (m) {
      if (m.marker.parentNode) m.marker.parentNode.removeChild(m.marker);
      markerMap.delete(el);
    }
  }

  function positionMarkers() {
    var i = 0;
    selected.forEach(function (el) {
      var m = markerMap.get(el);
      if (!m) { i++; return; }
      var r = el.getBoundingClientRect();
      if (!el.isConnected || (r.width === 0 && r.height === 0)) {
        m.marker.style.display = 'none';
        i++;
        return;
      }
      m.marker.style.display = 'block';
      m.marker.style.zIndex = i;
      var off = (i % 5) * 6; // 相邻标记错位，避免叠在一起
      var chipW = m.btn.offsetWidth || 56;
      var chipH = m.btn.offsetHeight || 24;
      var inside = r.width >= chipW + 8 && r.height >= chipH + 8;
      m.marker.classList.toggle('dp-outside', !inside);
      if (inside) {
        // 框内右上角
        m.marker.style.left = (r.right - chipW - 4 - off) + 'px';
        m.marker.style.top = (r.top + 4 + off) + 'px';
      } else {
        // 小元素：气泡放元素上方外侧，箭头指向元素
        var left = clamp(r.left + r.width / 2 - chipW / 2, 0, window.innerWidth - chipW);
        m.marker.style.left = left + 'px';
        m.marker.style.top = (r.top - chipH - 9 - off) + 'px';
      }
      i++;
    });
  }

  function scheduleMarkers() {
    if (markerRafPending) return;
    markerRafPending = true;
    requestAnimationFrame(function () {
      markerRafPending = false;
      positionMarkers();
    });
  }

  function createPopup() {
    popupEl = document.createElement('div');
    popupEl.setAttribute(APP_ATTR, '');
    popupEl.className = 'dp-popup';

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:6px';
    title.textContent = '用户建议';

    popupTextareaEl = document.createElement('textarea');
    popupTextareaEl.placeholder = '输入对该元素的修改建议…';

    var btns = document.createElement('div');
    btns.className = 'dp-popup-btns';
    btns.append(
      makeMiniBtn('取消', '', function () { closePopup(false); }),
      makeMiniBtn('保存', 'primary', function () { closePopup(true); })
    );

    popupEl.appendChild(title);
    popupEl.appendChild(popupTextareaEl);
    popupEl.appendChild(btns);
    document.body.appendChild(popupEl);
  }

  function openPopup(el) {
    popupTarget = el;
    var note = noteMap.get(el);
    popupTextareaEl.value = note ? note.value : '';
    popupEl.style.display = 'block';
    popupTextareaEl.focus();
  }

  function closePopup(save) {
    if (popupTarget && save) onNoteSave(popupTarget);
    popupEl.style.display = 'none';
    popupTarget = null;
  }

  function onNoteSave(el) {
    var note = noteMap.get(el);
    if (!note) return;
    note.value = popupTextareaEl.value;
    onNoteInput(el);
  }

  function onNoteInput(el) {
    syncBubble(el);
    if (popupTarget === el && popupEl && popupEl.style.display !== 'none') {
      popupTextareaEl.value = noteMap.get(el).value;
    }
  }

  function syncBubble(el) {
    var m = markerMap.get(el);
    var text = noteMap.get(el) ? noteMap.get(el).value.trim() : '';
    if (m) {
      m.bubble.textContent = truncate(text, 10);
      m.bubble.title = text;
      m.bubble.style.display = text ? 'block' : 'none';
    }
    var row = rowMap.get(el);
    if (row) {
      var badge = row.querySelector('.dp-note-badge');
      if (badge) badge.style.display = text ? 'inline' : 'none';
    }
  }

  function onPopupKeydown(e) {
    if (popupTarget && popupEl && popupEl.style.display !== 'none' && e.key === 'Escape') {
      e.stopPropagation();
      closePopup(false);
    }
  }

  /* ---------- 面板拖动与贴边 ---------- */

  var SNAP_THRESHOLD = 10; // 距屏幕左右边缘该像素内视为“贴边”

  // 首次接管定位：读取 CSS 初始位置（右下角），转为 left/top 内联坐标
  function initPanelPosition() {
    var r = panelEl.getBoundingClientRect();
    panelX = r.left;
    panelY = r.top;
    snapToEdge();
    applyPanelPosition();
    updateCollapsed();
  }

  function applyPanelPosition() {
    // 用带 important 的内联样式，确保覆盖 stylesheet 中 right/bottom 的 !important
    panelEl.style.setProperty('left', panelX + 'px', 'important');
    panelEl.style.setProperty('top', panelY + 'px', 'important');
    panelEl.style.setProperty('right', 'auto', 'important');
    panelEl.style.setProperty('bottom', 'auto', 'important');
  }

  // 判断当前是否贴近左右边缘：贴近则吸附到边缘，否则取消吸附（面板停在原处、不隐藏）
  function snapToEdge() {
    if (panelX === null) { snappedEdge = null; return; }
    var w = panelEl.offsetWidth;
    var rightDist = window.innerWidth - (panelX + w);
    if (panelX <= SNAP_THRESHOLD) snappedEdge = 'left';
    else if (rightDist <= SNAP_THRESHOLD) snappedEdge = 'right';
    else snappedEdge = null;
    if (snappedEdge === 'left') panelX = 0;
    else if (snappedEdge === 'right') panelX = window.innerWidth - w;
    panelEl.classList.toggle('dp-left', snappedEdge === 'left');
    panelEl.classList.toggle('dp-right', snappedEdge === 'right');
  }

  function onDragStart(e) {
    if (e.button !== 0) return;
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanelX = panelX;
    dragStartPanelY = panelY;
    panelEl.classList.remove('dp-collapsed'); // 拖动前先展开
    panelEl.classList.add('dp-dragging');
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  }

  function onDragMove(e) {
    if (!dragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    e.preventDefault();
    var w = panelEl.offsetWidth, h = panelEl.offsetHeight;
    panelX = clamp(dragStartPanelX + dx, 0, window.innerWidth - w);
    panelY = clamp(dragStartPanelY + dy, 0, window.innerHeight - h);
    applyPanelPosition();
  }

  function onDragEnd(e) {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    panelEl.classList.remove('dp-dragging');
    if (dragMoved) snapToEdge(); // 仅在真实拖动后判定是否贴边
    updateCollapsed();
  }

  function onPanelResize() {
    if (panelX === null) return;
    snapToEdge();
    panelY = clamp(panelY, 0, window.innerHeight - panelEl.offsetHeight);
    applyPanelPosition();
  }

  // 贴边且未悬停、未拖动、非选择模式时，缩成一个窄条
  function updateCollapsed() {
    var collapsed = !!snappedEdge && !dragging && !panelHovered && state !== SELECTING;
    panelEl.classList.toggle('dp-collapsed', collapsed);
  }

  /* ---------- 状态机与事件 ---------- */

  function setState(next) {
    if (next === state) return;
    state = next;
    var selecting = state === SELECTING;
    toggleBtn.textContent = selecting ? '退出选择' : '选择元素';
    overlayEl.style.display = selecting ? 'block' : 'none';
    if (selecting) {
      document.addEventListener('mouseover', onMouseOverCapture, true);
      document.addEventListener('mousedown', onMouseDownCapture, true);
      document.addEventListener('click', onClickCapture, true);
      document.addEventListener('keydown', onKeyDownCapture, true);
      document.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onScroll);
    } else {
      document.removeEventListener('mouseover', onMouseOverCapture, true);
      document.removeEventListener('mousedown', onMouseDownCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('keydown', onKeyDownCapture, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      lastHovered = null;
    }
    updateCollapsed();
  }

  function onMouseOverCapture(e) {
    var el = e.target;
    if (el.nodeType !== 1) return;
    if (el.ownerDocument !== document) return; // 忽略 iframe 内元素
    if (isOurUI(el)) return; // 自身 UI 不可选
    if (el === document.documentElement || el === document.body) {
      lastHovered = null;
      overlayEl.style.display = 'none'; // html/body 不给悬停高亮
      return;
    }
    lastHovered = el;
    positionOverlay(el);
  }

  function positionOverlay(el) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      if (state !== SELECTING || !el || el.ownerDocument !== document || !el.isConnected) {
        overlayEl.style.display = 'none';
        return;
      }
      var r = el.getBoundingClientRect();
      overlayEl.style.display = 'block';
      overlayEl.style.left = r.left + 'px';
      overlayEl.style.top = r.top + 'px';
      overlayEl.style.width = r.width + 'px';
      overlayEl.style.height = r.height + 'px';
    });
  }

  function onScroll() {
    if (state !== SELECTING) return;
    positionOverlay(lastHovered);
  }

  function onMouseDownCapture(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (isOurUI(e.target)) return;
    e.preventDefault(); // 防止选择模式下拖动选中页面文字
    e.stopImmediatePropagation();
  }

  function onClickCapture(e) {
    if (e.button !== undefined && e.button !== 0) return;
    var el = e.target;
    if (isOurUI(el)) return; // 自身 UI 正常响应点击
    e.preventDefault();
    e.stopImmediatePropagation(); // 屏蔽页面 click 处理
    if (el.nodeType === 1) addSelection(el);
  }

  function onKeyDownCapture(e) {
    if (popupTarget && popupEl && popupEl.style.display !== 'none') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closePopup(false);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      setState(IDLE);
    }
  }

  /* ---------- 选择与列表 ---------- */

  function addSelection(el) {
    if (el === document.documentElement || el === document.body) {
      showToast('不能选择 html/body 元素');
      return;
    }
    if (selected.has(el)) {
      showToast('已选过该元素');
      return;
    }
    selected.add(el);
    if (emptyEl.parentNode) emptyEl.remove();
    renderRow(el);
    updateCount();
    refreshHighlights();
    createMarker(el);
    scheduleMarkers();
  }

  function buildLabel(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id ? '#' + el.id : '';
    var classes = Array.prototype.slice.call(el.classList, 0, 3)
      .map(function (c) { return '.' + c; }).join('');
    var idx = '';
    if (el.parentElement) {
      var sibs = Array.prototype.filter.call(el.parentElement.children, function (ch) {
        return ch.tagName === el.tagName;
      });
      if (sibs.length > 1) idx = ' <' + (sibs.indexOf(el) + 1) + '>';
    }
    return tag + id + classes + idx;
  }

  function renderRow(el) {
    var row = document.createElement('div');
    row.className = 'dp-row';

    var summary = document.createElement('div');
    summary.className = 'dp-row-summary';
    summary.textContent = buildLabel(el);
    var badge = document.createElement('span');
    badge.className = 'dp-note-badge';
    badge.textContent = '💬 有建议';
    badge.style.display = 'none';
    summary.appendChild(badge);

    var preview = document.createElement('div');
    preview.className = 'dp-row-html';
    preview.textContent = truncate(el.outerHTML, 90);

    var note = document.createElement('input');
    note.className = 'dp-note';
    note.type = 'text';
    note.placeholder = '用户建议（可选）';
    note.addEventListener('input', function () { onNoteInput(el); });

    var btns = document.createElement('div');
    btns.className = 'dp-row-btns';
    btns.append(
      makeMiniBtn('复制', 'primary', function () { copyText(formatItem(el)); }),
      makeMiniBtn('选择器', '', function () {
        var sel = buildSelector(el);
        if (!sel) { showToast('无法生成唯一选择器'); return; }
        copyText(sel, '选择器');
      }),
      makeMiniBtn('✕', 'danger', function () { removeSelection(el); })
    );

    row.append(summary, preview, note, btns);
    listEl.appendChild(row);
    rowMap.set(el, row);
    noteMap.set(el, note);
  }

  function removeSelection(el) {
    selected.delete(el);
    var row = rowMap.get(el);
    if (row && row.parentNode) row.remove();
    rowMap.delete(el);
    noteMap.delete(el);
    clearHighlight(el);
    removeMarker(el);
    refreshHighlights();
    scheduleMarkers();
    if (popupTarget === el) closePopup(false);
    updateCount();
  }

  function clearAll() {
    if (!selected.size) { showToast('暂无已选元素'); return; }
    if (popupTarget) closePopup(false);
    selected.forEach(function (el) {
      clearHighlight(el);
      removeMarker(el);
    });
    selected.clear();
    rowMap = new WeakMap();
    noteMap = new WeakMap();
    listEl.textContent = '';
    listEl.appendChild(emptyEl);
    scheduleMarkers();
    updateCount();
    showToast('已清空');
  }

  function updateCount() {
    countEl.textContent = '已选元素(' + selected.size + ')';
    if (!selected.size && !emptyEl.parentNode) listEl.appendChild(emptyEl);
  }

  /* ---------- 唯一选择器 ---------- */

  function buildSelector(el) {
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';
    if (el.getRootNode() !== document) return null; // Shadow DOM 不穿透

    var parts = [];
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      // 1) 文档级唯一的 id 直接短路
      if (cur.id) {
        var idSel = '#' + cssEscape(cur.id);
        if (document.querySelector(idSel) === cur) {
          return idSel + parts.map(function (p) { return ' > ' + p; }).join('');
        }
      }
      // 2) 文档级唯一的 class 组合（最多取 3 个，从多到少尝试）
      var cls = Array.prototype.filter.call(cur.classList, function (c) {
        return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(c);
      });
      for (var n = Math.min(cls.length, 3); n >= 1; n--) {
        var combo = cls.slice(0, n);
        var sel2 = cur.tagName.toLowerCase() + combo.map(function (c) { return '.' + cssEscape(c); }).join('');
        var found = document.querySelectorAll(sel2);
        if (found.length === 1 && found[0] === cur) {
          return sel2 + parts.map(function (p) { return ' > ' + p; }).join('');
        }
      }
      // 3) 兄弟间 nth-of-type 兜底
      var tag = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      var nth = 1;
      if (parent) {
        var sibs = Array.prototype.filter.call(parent.children, function (ch) {
          return ch.tagName === cur.tagName;
        });
        nth = sibs.indexOf(cur) + 1;
      }
      parts.unshift(tag + ':nth-of-type(' + nth + ')');
      cur = parent;
    }
    if (!parts.length) return null;
    var sel = parts.join(' > ');
    if (cur === document.body) sel = 'body > ' + sel;
    return document.querySelector(sel) === el ? sel : null;
  }

  /* ---------- 复制 ---------- */

  function copyAll() {
    if (!selected.size) { showToast('暂无已选元素'); return; }
    var blocks = [];
    selected.forEach(function (el) { blocks.push(formatItem(el)); });
    copyText(blocks.join('\n\n'), '全部');
  }

  function copyText(text, what) {
    var done = function () { showToast('已复制' + (what ? '（' + what + '）' : '')); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) done();
    else showToast('复制失败，请手动复制');
  }

  /* ---------- 入口与清理 ---------- */

  function init() {
    if (document.querySelector('[' + APP_ATTR + ']')) return; // 防重复注入
    initStyles();
    createOverlay();
    createPanel();
    initPanelPosition();
    createToast();
    createMarkerLayer();
    createPopup();
    document.addEventListener('scroll', scheduleMarkers, true);
    window.addEventListener('resize', scheduleMarkers);
    document.addEventListener('keydown', onPopupKeydown);
    window.__selectDomCleanup = cleanup;
  }

  function cleanup() {
    setState(IDLE);
    window.removeEventListener('resize', onPanelResize);
    document.removeEventListener('scroll', scheduleMarkers, true);
    window.removeEventListener('resize', scheduleMarkers);
    document.removeEventListener('keydown', onPopupKeydown);
    selected.forEach(function (el) { clearHighlight(el); });
    [styleEl, overlayEl, panelEl, toastEl, markerLayerEl, popupEl].forEach(function (n) {
      if (n && n.parentNode) n.parentNode.removeChild(n);
    });
    delete window.__selectDomCleanup;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();