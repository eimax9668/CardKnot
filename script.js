const viewport = document.getElementById('viewport');
const canvas = document.getElementById('canvas');
const canvasZoomWrap = document.getElementById('canvas-zoom-wrap');
const svgLayer = document.getElementById('connections-layer');
const zoomPercentEl = document.getElementById('zoom-percent');

let cards = [];
let connections = [];
let selectedCards = new Set();

let scale = 1;
let zoomActivated = false;
let translateX = -4500;
let translateY = -4500;

let isDragging = false;
let isPanning = false;
let isDrawingLine = false;
let isSelecting = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let canvasStart = { x: 0, y: 0 };
let lineStartCardId = null;
let lineStartSide = null;
let tempLine = null;
let mouseDownTime = 0;

let initialPinchDistance = null;
let initialPinchScale = 1;
let redrawTimeout = null;
let saveTimeout = null;
let isLoading = false;
let initialCardPositions = new Map();
let selectionStart = { x: 0, y: 0 };
let selectionBox = null;
let undoStack = [];
let redoStack = [];
let clipboard = null;
let dragStartState = null;
let contextMenu = null;
let contextMenuPosition = { x: 0, y: 0 };
let minimapState = { minX: 0, minY: 0, scale: 1 };
let isMinimapDragging = false;
let resizeStart = { x: 0, y: 0 };
let resizeStartDims = { w: 0, h: 0 };
let resizingCardId = null;
let isRemoteUpdate = false;
const USER_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
    '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', 
    '#f43f5e', '#64748b'
];
let myCursorId = Math.random().toString(36).substr(2, 9);
let myCursorColor = localStorage.getItem('cardKnotUserColor') || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
let myUserName = localStorage.getItem('cardKnotUserName') || ('User ' + myCursorId.substr(0, 4));
let lastCursorUpdate = 0;
let lastMousePos = { x: 0, y: 0 };
let remoteCursors = new Map(); // 相手のカーソル管理用

function getYouTubeVideoId(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

function escapeHtml(text) {
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function updateTransform() {
    const tx = Math.round(translateX);
    const ty = Math.round(translateY);

    if (!redrawTimeout) {
        canvasZoomWrap.style.willChange = 'transform';
    }

    canvasZoomWrap.style.transform =
      `translate(${tx}px, ${ty}px) scale(${scale})`;
    canvasZoomWrap.style.transformOrigin = '0 0';

    zoomPercentEl.innerText = `${Math.round(scale * 100)}%`;

    const dotSize = 40 * scale;
    viewport.style.backgroundSize = `${dotSize}px ${dotSize}px`;
    viewport.style.backgroundPosition = `${tx}px ${ty}px`;

    updateMinimap();

    if (redrawTimeout) clearTimeout(redrawTimeout);
    redrawTimeout = setTimeout(() => {
        canvasZoomWrap.style.willChange = 'auto';
        // コンテナ全体の再描画を強制（opacityを微小に変更して戻す）
        const prevOpacity = canvasZoomWrap.style.opacity;
        canvasZoomWrap.style.opacity = '0.999'; 
        void canvasZoomWrap.offsetHeight; // リフローを強制
        canvasZoomWrap.style.opacity = prevOpacity || '';

        // DOM操作による強力な再描画トリガー（内容書き換えと同等の効果）
        const dummy = document.createTextNode('');
        canvas.appendChild(dummy);
        canvas.removeChild(dummy);
        
        redrawTimeout = null;
    }, 300);
    renderRemoteCursors();
}

function screenToCanvas(x, y) {
    return {
        x: (x - translateX) / scale,
        y: (y - translateY) / scale
    };
}

function addNewCard(type) {
    // ツールバーからの呼び出し用ヘルパー
    addCard(null, null, "", "", "", "", null, null, false, false, false, type, null, null, "");
}

function addCard(x = null, y = null, text = "", imageUrl = "", videoUrl = "", linkUrl = "", id = null, color = null, collapsed = false, pinned = false, favorite = false, type = 'text', width = null, height = null, linkTitle = "") {
    if (x === null || y === null) {
        const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
        x = center.x - 110;
        y = center.y - 75;
    }

    const cardId = id || 'card-' + Math.random().toString(36).substr(2, 9);
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.id = cardId;
    cardEl.classList.add(`card-type-${type}`);
    cardEl.style.left = x + 'px';
    cardEl.style.top = y + 'px';
    if (color && color !== '#ffffff') {
        cardEl.style.backgroundColor = color;
    }
    if (collapsed) cardEl.classList.add('collapsed');
    if (pinned) cardEl.classList.add('pinned');
    if (favorite) cardEl.classList.add('favorite');

    let contentHtml = '';
    
    // 画像カード
    if (type === 'image') {
        if (imageUrl) {
            contentHtml = `<img class="card-image" src="${escapeHtml(imageUrl)}" alt="Card image">`;
        } else {
            contentHtml = `<div class="content-placeholder" onclick="openImageModal('${cardId}')"><i class="bi bi-image text-2xl mb-1"></i><span class="text-xs">画像を設定</span></div>`;
        }
    } 
    // 動画カード
    else if (type === 'video') {
        if (videoUrl) {
            const ytId = getYouTubeVideoId(videoUrl);
            contentHtml = ytId ? 
                `<iframe class="card-video-iframe" src="https://www.youtube.com/embed/${escapeHtml(ytId)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : 
                `<video class="card-video" src="${escapeHtml(videoUrl)}" controls></video>`;
        } else {
            contentHtml = `<div class="content-placeholder" onclick="openVideoModal('${cardId}')"><i class="bi bi-camera-video text-2xl mb-1"></i><span class="text-xs">動画を設定</span></div>`;
        }
    }
    // リンクカード
    else if (type === 'link') {
        if (linkUrl) {
            let domain = '';
            try { domain = new URL(linkUrl).hostname; } catch(e) { domain = linkUrl; }
            contentHtml = `
                <div class="card-link-content" onclick="window.open('${escapeHtml(linkUrl)}', '_blank')">
                    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" class="card-link-image">` : ''}
                    <div class="card-link-info">
                        <div class="card-link-title">${escapeHtml(linkTitle || linkUrl)}</div>
                        <div class="card-link-url">${escapeHtml(domain)}</div>
                    </div>
                </div>
            `;
        } else {
            contentHtml = `<div class="content-placeholder" onclick="openLinkCardModal('${cardId}')"><i class="bi bi-link-45deg text-2xl mb-1"></i><span class="text-xs">リンクを設定</span></div>`;
        }
    }
    // テキストカード（デフォルト）
    else {
        // 既存データ互換のため、もし画像や動画データがあれば表示はする（追加メニューはなし）
        if (imageUrl) contentHtml += `<img class="card-image" src="${escapeHtml(imageUrl)}" alt="Card image">`;
        if (videoUrl) {
            const ytId = getYouTubeVideoId(videoUrl);
            contentHtml += ytId ? 
                `<iframe class="card-video-iframe" src="https://www.youtube.com/embed/${escapeHtml(ytId)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>` : 
                `<video class="card-video" src="${escapeHtml(videoUrl)}" controls></video>`;
        }
        contentHtml += `<textarea class="card-textarea" placeholder="思考を書き出す...">${escapeHtml(text)}</textarea>`;
    }

    cardEl.innerHTML = `
        <div class="pin-icon"><i class="bi bi-pin-angle-fill"></i></div>
        <button class="collapse-btn" title="折りたたみ"><i class="bi bi-chevron-down"></i></button>
        ${contentHtml}
        ${linkUrl ? `<div class="card-link-preview"><i class="bi bi-link-45deg"></i><span class="card-link-text">${escapeHtml(linkUrl)}</span></div>` : ''}
        <div class="connector-point connector-left" data-side="left"></div>
        <div class="connector-point connector-right" data-side="right"></div>
        <div class="resize-handle"></div>
    `;

    if (collapsed) {
        cardEl.querySelector('.collapse-btn i').className = 'bi bi-chevron-right';
    }

    const handleDown = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        mouseDownTime = Date.now();

        if (e.target.classList.contains('connector-point')) {
            startDrawingLine(clientX, clientY, cardId, e.target.dataset.side);
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        } else if (e.target.classList.contains('resize-handle')) {
            startResize(clientX, clientY, cardId);
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        } else {
            if (e.shiftKey) {
                if (selectedCards.has(cardEl)) removeFromSelection(cardEl);
                else addToSelection(cardEl);
            } else {
                if (!selectedCards.has(cardEl)) selectSingleCard(cardEl);
            }

            if (e.target.tagName !== 'TEXTAREA' && !e.target.closest('.collapse-btn') && !e.target.classList.contains('card-image') && !e.target.closest('.card-link-preview') && !e.target.closest('.content-placeholder')) {
                if (selectedCards.has(cardEl)) {
                    startDrag(clientX, clientY);
                }
                e.stopPropagation();
                if (e.cancelable && !e.touches) e.preventDefault();
            }
        }
    };

    cardEl.addEventListener('mousedown', handleDown);
    cardEl.addEventListener('touchstart', handleDown, { passive: false });

    cardEl.querySelectorAll('.connector-point').forEach(point => {
        point.addEventListener('click', (e) => {
            if (Date.now() - mouseDownTime < 200) {
                saveState();
                disconnectPoint(cardId, point.dataset.side);
                e.stopPropagation();
            }
        });
    });

    cardEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 選択されていないカード上で右クリックした場合、そのカードを選択状態にする
        if (!selectedCards.has(cardEl)) {
            if (!e.shiftKey) {
                selectSingleCard(cardEl);
            } else {
                addToSelection(cardEl);
            }
        }
        showContextMenu(e.clientX, e.clientY, 'card');
    });

    const collapseBtn = cardEl.querySelector('.collapse-btn');
    collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollapse(cardId);
    });

    const cardImage = cardEl.querySelector('.card-image');
    if (cardImage) {
        cardImage.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(imageUrl, '_blank');
        });
    }

    const linkPreview = cardEl.querySelector('.card-link-preview');
    if (linkPreview) {
        linkPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(linkUrl, '_blank');
        });
    }

    const textarea = cardEl.querySelector('.card-textarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            saveData();
            const card = cards.find(c => c.id === cardId);
            if (window.broadcastCard && card) window.broadcastCard(serializeCard(card));
        });
    }

    canvas.appendChild(cardEl);
    cards.push({ id: cardId, el: cardEl, collapsed: collapsed, pinned: pinned, favorite: favorite, imageUrl, videoUrl, linkUrl, baseX: x, baseY: y, type: type, width: width, height: height, linkTitle: linkTitle });
    updateCardStyles(cardEl, x, y, width, height); 
    if (window.broadcastCard && !isRemoteUpdate) {
        window.broadcastCard(serializeCard(cards[cards.length - 1]));
    }
    saveData();
    return cardId;
}

function toggleCollapse(cardId) {
    const cardObj = cards.find(c => c.id === cardId);
    if (!cardObj) return;

    saveState();
    cardObj.collapsed = !cardObj.collapsed;
    const icon = cardObj.el.querySelector('.collapse-btn i');
    
    if (cardObj.collapsed) {
        cardObj.el.classList.add('collapsed');
        icon.className = 'bi bi-chevron-right';
        collapseChildren(cardId);
    } else {
        cardObj.el.classList.remove('collapsed');
        icon.className = 'bi bi-chevron-down';
        expandChildren(cardId);
    }
    updateConnections();
    saveData();
    if (window.broadcastCard) window.broadcastCard(serializeCard(cardObj));
}

function collapseChildren(cardId, visited = new Set()) {
    if (visited.has(cardId)) return;
    visited.add(cardId);

    const childConns = connections.filter(c => c.from === cardId);
    childConns.forEach(conn => {
        if (visited.has(conn.to)) return;

        const childCard = cards.find(c => c.id === conn.to);
        if (childCard) {
            childCard.el.style.display = 'none';
            collapseChildren(conn.to, visited);
        }
    });
}

function expandChildren(cardId, visited = new Set()) {
    if (visited.has(cardId)) return;
    visited.add(cardId);

    const childConns = connections.filter(c => c.from === cardId);
    childConns.forEach(conn => {
        if (visited.has(conn.to)) return;

        const childCard = cards.find(c => c.id === conn.to);
        if (childCard) {
            childCard.el.style.display = 'flex';
            if (!childCard.collapsed) {
                expandChildren(conn.to, visited);
            }
        }
    });
}

let currentModalCardId = null;

function openImageModal(cardId) {
    hideContextMenu();
    currentModalCardId = cardId;
    const card = cards.find(c => c.id === cardId);
    document.getElementById('image-modal').style.display = 'flex';
    
    const input = document.getElementById('image-url-input');
    const deleteBtn = document.getElementById('image-delete-btn');
    
    input.value = card && card.imageUrl ? card.imageUrl : '';
    deleteBtn.style.display = card && card.imageUrl ? 'flex' : 'none';
    
    input.focus();
}

function closeImageModal() {
    document.getElementById('image-modal').style.display = 'none';
    currentModalCardId = null;
}

function addImageToCard() {
    const url = document.getElementById('image-url-input').value.trim();
    if (!url || !currentModalCardId) return;

    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    let existingImage = cardObj.el.querySelector('.card-image');
    if (existingImage) {
        existingImage.src = url;
    } 
    // プレースホルダーがある場合は置換
    else {
        // カードを再描画するのが一番確実
        cardObj.imageUrl = url;
        const { x, y, text, videoUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle } = serializeCard(cardObj);
        cardObj.el.remove();
        cards = cards.filter(c => c.id !== id);
        addCard(x, y, text, url, videoUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle);
        closeImageModal();
        saveData();
        return;
    }

    cardObj.imageUrl = url;
    closeImageModal();
    saveData();
}

function deleteImageFromCard() {
    if (!currentModalCardId) return;
    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    const existingImage = cardObj.el.querySelector('.card-image');
    if (existingImage) {
        // 画像カードの場合はプレースホルダーに戻すために再描画
        cardObj.imageUrl = "";
        const { x, y, text, videoUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle } = serializeCard(cardObj);
        cardObj.el.remove();
        cards = cards.filter(c => c.id !== id);
        addCard(x, y, text, "", videoUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle);
    }
    
    cardObj.imageUrl = "";
    closeImageModal();
    saveData();
}

function openVideoModal(cardId) {
    hideContextMenu();
    currentModalCardId = cardId;
    const card = cards.find(c => c.id === cardId);
    document.getElementById('video-modal').style.display = 'flex';
    
    const input = document.getElementById('video-url-input');
    const deleteBtn = document.getElementById('video-delete-btn');
    
    input.value = card && card.videoUrl ? card.videoUrl : '';
    deleteBtn.style.display = card && card.videoUrl ? 'flex' : 'none';
    
    input.focus();
}

function closeVideoModal() {
    document.getElementById('video-modal').style.display = 'none';
    currentModalCardId = null;
}

function addVideoToCard() {
    const url = document.getElementById('video-url-input').value.trim();
    if (!url || !currentModalCardId) return;

    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    
    // 動画カードの場合は再描画してプレースホルダーを動画に置き換える
    cardObj.videoUrl = url;
    const { x, y, text, imageUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle } = serializeCard(cardObj);
    cardObj.el.remove();
    cards = cards.filter(c => c.id !== id);
    addCard(x, y, text, imageUrl, url, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle);

    cardObj.videoUrl = url;
    closeVideoModal();
    saveData();
}

function deleteVideoFromCard() {
    if (!currentModalCardId) return;
    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    
    // 動画カードの場合はプレースホルダーに戻すために再描画
    cardObj.videoUrl = "";
    const { x, y, text, imageUrl, linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle } = serializeCard(cardObj);
    cardObj.el.remove();
    cards = cards.filter(c => c.id !== id);
    addCard(x, y, text, imageUrl, "", linkUrl, id, color, collapsed, pinned, favorite, type, width, height, linkTitle);

    cardObj.videoUrl = "";
    closeVideoModal();
    saveData();
}

function openLinkModal(cardId) {
    hideContextMenu();
    currentModalCardId = cardId;
    const card = cards.find(c => c.id === cardId);
    document.getElementById('link-modal').style.display = 'flex';
    
    const input = document.getElementById('link-url-input');
    const deleteBtn = document.getElementById('link-delete-btn');
    
    input.value = card && card.linkUrl ? card.linkUrl : '';
    deleteBtn.style.display = card && card.linkUrl ? 'flex' : 'none';
    
    input.focus();
}

function closeLinkModal() {
    document.getElementById('link-modal').style.display = 'none';
    currentModalCardId = null;
}

function addLinkToCard() {
    const url = document.getElementById('link-url-input').value.trim();
    if (!url || !currentModalCardId) return;

    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    let existingLink = cardObj.el.querySelector('.card-link-preview');
    if (existingLink) {
        existingLink.querySelector('.card-link-text').innerText = url;
    } else {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'card-link-preview';
        linkDiv.innerHTML = `<i class="bi bi-link-45deg"></i><span class="card-link-text">${escapeHtml(url)}</span>`;
        linkDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(url, '_blank');
        });
        // テキストエリアがあればその前、なければ末尾
        const textarea = cardObj.el.querySelector('.card-textarea') || null;
        cardObj.el.insertBefore(linkDiv, textarea);
    }

    cardObj.linkUrl = url;
    closeLinkModal();
    saveData();
    if (window.broadcastCard) window.broadcastCard(serializeCard(cardObj));
}

function deleteLinkFromCard() {
    if (!currentModalCardId) return;
    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    saveState();
    const existingLink = cardObj.el.querySelector('.card-link-preview');
    if (existingLink) {
        existingLink.remove();
    }
    cardObj.linkUrl = "";
    closeLinkModal();
    saveData();
    if (window.broadcastCard) window.broadcastCard(serializeCard(cardObj));
}

function openLinkCardModal(cardId) {
    hideContextMenu();
    currentModalCardId = cardId;
    const card = cards.find(c => c.id === cardId);
    document.getElementById('link-card-modal').style.display = 'flex';
    
    const urlInput = document.getElementById('link-card-url');
    const titleInput = document.getElementById('link-card-title');
    const imageInput = document.getElementById('link-card-image');
    
    urlInput.value = card && card.linkUrl ? card.linkUrl : '';
    titleInput.value = card && card.linkTitle ? card.linkTitle : '';
    imageInput.value = card && card.imageUrl ? card.imageUrl : '';
    
    urlInput.focus();
}

function closeLinkCardModal() {
    document.getElementById('link-card-modal').style.display = 'none';
    currentModalCardId = null;
}

function saveLinkCard() {
    if (!currentModalCardId) return;
    const cardObj = cards.find(c => c.id === currentModalCardId);
    if (!cardObj) return;

    const url = document.getElementById('link-card-url').value.trim();
    const title = document.getElementById('link-card-title').value.trim();
    const image = document.getElementById('link-card-image').value.trim();

    const { x, y, text, videoUrl, id, color, collapsed, pinned, favorite, type, width, height } = serializeCard(cardObj);
    cardObj.el.remove();
    cards = cards.filter(c => c.id !== id);
    addCard(x, y, text, image, videoUrl, url, id, color, collapsed, pinned, favorite, type, width, height, title);
    
    closeLinkCardModal();
}

function updateSelectionVisuals() {
    cards.forEach(c => c.el.classList.remove('selected'));
    selectedCards.forEach(el => el.classList.add('selected'));
    
    if (selectedCards.size > 0) {
        const last = Array.from(selectedCards).pop();
        updateToolbarColors(rgbToHex(last.style.backgroundColor));
    } else {
        updateToolbarColors(null);
    }
}

function addToSelection(el) {
    selectedCards.add(el);
    updateSelectionVisuals();
    broadcastMyCursor();
}

function removeFromSelection(el) {
    selectedCards.delete(el);
    updateSelectionVisuals();
    broadcastMyCursor();
}

function clearSelection() {
    selectedCards.clear();
    updateSelectionVisuals();
    broadcastMyCursor();
}

function selectSingleCard(el) {
    selectedCards.clear();
    selectedCards.add(el);
    updateSelectionVisuals();
    broadcastMyCursor();
}

function updateToolbarColors(hex) {
    document.querySelectorAll('.color-dot').forEach(dot => {
        if (dot.dataset.color === hex) dot.classList.add('active-color');
        else dot.classList.remove('active-color');
    });
}

function startDrag(x, y) {
    isDragging = true;
    dragStartState = serializeState();
    dragStart = { x, y };
    initialCardPositions.clear();
    selectedCards.forEach(el => {
        const card = cards.find(c => c.id === el.id);
        if (card && !card.pinned) { // ピン留めされていないカードのみ移動可能
            initialCardPositions.set(el.id, {
                x: parseFloat(el.style.left),
                y: parseFloat(el.style.top)
            });
        }
    });
}

function startDrawingLine(x, y, cardId, side) {
    isDrawingLine = true;
    lineStartCardId = cardId;
    lineStartSide = side;
    
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.setAttribute('class', 'connection-line');
    tempLine.style.strokeDasharray = "8,8";
    tempLine.style.stroke = "#3b82f6";
    tempLine.style.opacity = "0.6";
    svgLayer.appendChild(tempLine);
}

function startResize(clientX, clientY, cardId) {
    isResizing = true;
    resizingCardId = cardId;
    resizeStart = { x: clientX, y: clientY };
    
    const card = cards.find(c => c.id === cardId);
    if (card) {
        resizeStartDims = {
            w: card.el.offsetWidth,
            h: card.el.offsetHeight
        };
    }
}

function disconnectPoint(cardId, side) {
    // saveState() is called in the click handler
    connections = connections.filter(conn => {
        const isTarget = (conn.from === cardId && conn.fromSide === side) || 
                         (conn.to === cardId && conn.toSide === side);
        return !isTarget;
    });
    updateConnections();
    saveData();
    if (window.broadcastConnections) window.broadcastConnections(connections);
}

function updateConnections() {
    const existingLines = svgLayer.querySelectorAll('.connection-line');
    existingLines.forEach(l => { if (l !== tempLine) l.remove(); });

    connections.forEach(conn => {
        const fromEl = document.getElementById(conn.from);
        const toEl = document.getElementById(conn.to);
        if (fromEl && toEl && fromEl.style.display !== 'none' && toEl.style.display !== 'none') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            line.setAttribute('class', 'connection-line');
            
            line.setAttribute('d', calculatePath(fromEl, toEl, null, null, conn.fromSide, conn.toSide));
            svgLayer.appendChild(line);
        }
    });
}

function calculatePath(fromEl, toEl, targetX = null, targetY = null, fromSide = 'right', toSide = 'left') {
    const fromRect = {
        x: parseFloat(fromEl.style.left),
        y: parseFloat(fromEl.style.top),
        w: fromEl.offsetWidth,
        h: fromEl.offsetHeight
    };
    const startX = fromSide === 'right' ? fromRect.x + fromRect.w : fromRect.x;
    const startY = fromRect.y + fromRect.h / 2;
    let endX, endY;
    if (toEl) {
        const toRect = {
            x: parseFloat(toEl.style.left),
            y: parseFloat(toEl.style.top),
            w: toEl.offsetWidth,
            h: toEl.offsetHeight
        };
        endX = toSide === 'right' ? toRect.x + toRect.w : toRect.x;
        endY = toRect.y + toRect.h / 2;
    } else {
        endX = targetX;
        endY = targetY;
    }
    const dx = Math.abs(endX - startX);
    const curvature = Math.max(dx / 2, 40);
    const cp1x = fromSide === 'right' ? startX + curvature : startX - curvature;
    const cp2x = toSide === 'left' ? endX - curvature : endX + curvature;
    return `M ${startX} ${startY} C ${cp1x} ${startY}, ${cp2x} ${endY}, ${endX} ${endY}`;
}

function adjustZoomOnceUserInteracts(factor, clientX, clientY) {
    if (!zoomActivated) zoomActivated = true;
    adjustZoom(factor, clientX, clientY);
}

function adjustZoom(factor, clientX, clientY) { // 本格リファクタ版
    const oldScale = scale;
    scale = Math.min(Math.max(scale * factor, 0.15), 3);
    
    if (clientX !== undefined && clientY !== undefined) {
        const ratio = scale / oldScale;
        translateX = clientX - (clientX - translateX) * ratio;
        translateY = clientY - (clientY - translateY) * ratio;
    }

    applyZoomUpdate();
    updateTransform();
}

function resetZoom() { // 本格リファクタ版
    scale = 1;
    translateX = Math.round(-4800 + window.innerWidth / 2);
    translateY = Math.round(-4800 + window.innerHeight / 2);
    updateTransform();
    applyZoomUpdate();
}

viewport.addEventListener('wheel', (e) => {
    if (e.target.closest('.card-textarea')) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    adjustZoomOnceUserInteracts(factor, e.clientX, e.clientY);
}, { passive: false });

viewport.addEventListener('mousedown', (e) => {
    const isBackground = e.target === viewport || e.target === canvasZoomWrap || e.target === canvas;
    
    if (isBackground) {
        if (e.button === 0 && e.shiftKey) { // 左クリック + Shift: 範囲選択
            isSelecting = true;
            selectionStart = { x: e.clientX, y: e.clientY };
            
            if (!selectionBox) {
                selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                document.body.appendChild(selectionBox);
            }
            selectionBox.style.display = 'block';
            selectionBox.style.left = e.clientX + 'px';
            selectionBox.style.top = e.clientY + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            
        } else if (e.button === 0 || e.button === 1 || e.button === 2) { // 左(Shiftなし)/中/右クリック: パン
            isPanning = true;
            dragStart = { x: e.clientX, y: e.clientY };
            canvasStart = { x: translateX, y: translateY };
            if (e.button === 0) clearSelection();
        }
    }
});

const handleMove = (e) => {
    if (e.touches && e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const dist = Math.sqrt(Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2));
        if (initialPinchDistance === null) {
            initialPinchDistance = dist;
            initialPinchScale = scale;
        } else {
            const factor = dist / initialPinchDistance;
            const newScale = Math.min(Math.max(initialPinchScale * factor, 0.15), 3);
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            translateX = centerX - (centerX - translateX) * (newScale / scale);
            translateY = centerY - (centerY - translateY) * (newScale / scale);
            scale = newScale;
            updateTransform();
            applyZoomUpdate();
        }
        return;
    }
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    if (clientX === undefined) return;
    if (isPanning) {
        translateX = canvasStart.x + (clientX - dragStart.x);
        translateY = canvasStart.y + (clientY - dragStart.y);
        updateTransform();
    }
    
    lastMousePos = screenToCanvas(clientX, clientY);

    const now = Date.now();
    if (now - lastCursorUpdate > 100) {
        broadcastMyCursor();
        lastCursorUpdate = now;
    }

    if (isSelecting && selectionBox) {
        const currentX = clientX;
        const currentY = clientY;
        
        const left = Math.min(selectionStart.x, currentX);
        const top = Math.min(selectionStart.y, currentY);
        const width = Math.abs(currentX - selectionStart.x);
        const height = Math.abs(currentY - selectionStart.y);
        
        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';

        const boxRect = { left, right: left + width, top, bottom: top + height };

        cards.forEach(card => {
            const cardRect = card.el.getBoundingClientRect();
            const intersect = !(boxRect.right < cardRect.left || 
                                boxRect.left > cardRect.right || 
                                boxRect.bottom < cardRect.top || 
                                boxRect.top > cardRect.bottom);
            
            if (intersect) selectedCards.add(card.el);
            else if (!e.shiftKey) selectedCards.delete(card.el);
        });
        updateSelectionVisuals();
    }
    const coords = screenToCanvas(clientX, clientY);
    if (isDrawingLine && tempLine) {
        const startCard = cards.find(c => c.id === lineStartCardId);
        if (startCard) {
            const toSide = coords.x > parseFloat(startCard.el.style.left) + 110 ? 'left' : 'right';
            tempLine.setAttribute('d', calculatePath(startCard.el, null, coords.x, coords.y, lineStartSide, toSide));
        }
    }
    if (isResizing && resizingCardId) {
        const card = cards.find(c => c.id === resizingCardId);
        if (card) {
            const dx = (clientX - resizeStart.x) / scale;
            const dy = (clientY - resizeStart.y) / scale;
            
            const newWidth = Math.max(220, resizeStartDims.w + dx);
            const newHeight = Math.max(150, resizeStartDims.h + dy);
            
            card.el.style.width = newWidth + 'px';
            card.el.style.height = newHeight + 'px';
            card.width = newWidth;
            card.height = newHeight;
            
            updateConnections();
        }
    }
    if (isDragging && selectedCards.size > 0) {
        const startCoords = screenToCanvas(dragStart.x, dragStart.y);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;

        selectedCards.forEach(el => {
            const initial = initialCardPositions.get(el.id);
            if (initial) {
                const newX = initial.x + dx;
                const newY = initial.y + dy;
                el.style.left = newX + 'px';
                el.style.top = newY + 'px';
                const card = cards.find(c => c.id === el.id);
                if (card) {
                    card.baseX = newX;
                    card.baseY = newY;
                    if (window.broadcastCard) {
                        window.broadcastCard({ id: el.id, x: newX, y: newY });
                    }
                }
            }
        });
        updateConnections();
    }
};

const handleUp = (e) => {
    initialPinchDistance = null;
    if (isDrawingLine) {
        const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
        const targetEl = document.elementFromPoint(clientX, clientY);
        const targetCard = targetEl ? targetEl.closest('.card') : null;
        if (targetCard && targetCard.id !== lineStartCardId) {
            const rect = targetCard.getBoundingClientRect();
            saveState();
            const toSide = clientX < rect.left + rect.width / 2 ? 'left' : 'right';
            connections.push({
                from: lineStartCardId,
                to: targetCard.id,
                fromSide: lineStartSide,
                toSide: toSide
            });

            if (window.broadcastConnections) window.broadcastConnections(connections);
            const startCardObj = cards.find(c => c.id === lineStartCardId);
            if (startCardObj && (startCardObj.collapsed || startCardObj.el.style.display === 'none')) {
                const targetCardObj = cards.find(c => c.id === targetCard.id);
                if (targetCardObj) {
                    targetCardObj.el.style.display = 'none';
                    collapseChildren(targetCard.id, new Set([lineStartCardId]));
                }
            }
        }
        if (tempLine) tempLine.remove();
        tempLine = null;
        isDrawingLine = false;
        updateConnections();
        saveData();
    }
    if (isDragging && dragStartState) {
        // ドラッグ終了時に位置が変わっていたらUndoスタックに保存
        const currentState = serializeState();
        const hasChanged = JSON.stringify(currentState.cards.map(c => ({id:c.id, x:c.x, y:c.y}))) !== 
                           JSON.stringify(dragStartState.cards.map(c => ({id:c.id, x:c.x, y:c.y})));
        if (hasChanged) {
            undoStack.push(dragStartState);
        }
        dragStartState = null;
    }
    if (isResizing) {
        isResizing = false;
        if (window.broadcastCard) window.broadcastCard(serializeCard(cards.find(c => c.id === resizingCardId)));
        resizingCardId = null;
        saveData();
    }
    isDragging = false;
    isPanning = false;
    if (isSelecting) {
        isSelecting = false;
        if (selectionBox) selectionBox.style.display = 'none';
    }
};

window.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleUp);
viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && (e.target === viewport || e.target === canvasZoomWrap || e.target === canvas)) {
        isPanning = true;
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        canvasStart = { x: translateX, y: translateY };
        clearSelection();
    } else if (e.touches.length === 2) {
        isPanning = false;
        initialPinchDistance = null;
    }
}, { passive: false });
viewport.addEventListener('touchmove', (e) => {
    handleMove(e);
    if (isPanning || isDragging || isDrawingLine || isResizing || e.touches.length === 2) {
        e.preventDefault();
    }
}, { passive: false });
viewport.addEventListener('touchend', handleUp);
viewport.addEventListener('contextmenu', e => {
    e.preventDefault();
    const isBackground = e.target === viewport || e.target === canvasZoomWrap || e.target === canvas;
    if (isBackground) {
        showContextMenu(e.clientX, e.clientY, 'background');
    }
});


function changeColor(color) {
    if (selectedCards.size > 0) {
        saveState();
        selectedCards.forEach(el => {
            if (color === '#ffffff') el.style.backgroundColor = '';
            else el.style.backgroundColor = color;
        });
        selectedCards.forEach(el => { if(window.broadcastCard) window.broadcastCard(serializeCard(cards.find(c => c.id === el.id))); });
        updateToolbarColors(color);
        saveData();
    }
}

function deleteSelected() {
    if (selectedCards.size > 0) {
        saveState();
        const idsToRemove = new Set();
        selectedCards.forEach(el => {
            idsToRemove.add(el.id);
            el.remove();
            if (window.broadcastDelete) window.broadcastDelete(el.id);
        });
        connections = connections.filter(c => !idsToRemove.has(c.from) && !idsToRemove.has(c.to));
        cards = cards.filter(c => !idsToRemove.has(c.id));
        selectedCards.clear();
        updateConnections();
        if (window.broadcastConnections) window.broadcastConnections(connections);
        updateToolbarColors(null);
        saveData();
        broadcastMyCursor();
    }
}

function autoLayout() {
    if (cards.length === 0) return;
    saveState();

    const spacingX = 320; // 横方向の間隔（階層）
    const spacingY = 200; // 縦方向の間隔（同階層内のカード）

    // グラフ構造の構築
    const children = {};
    const parents = {};
    cards.forEach(c => {
        children[c.id] = [];
        parents[c.id] = [];
    });

    connections.forEach(conn => {
        if (children[conn.from]) children[conn.from].push(conn.to);
        if (parents[conn.to]) parents[conn.to].push(conn.from);
    });

    // ルートノード（親がいないノード）を特定
    let roots = cards.filter(c => parents[c.id].length === 0).map(c => c.id);
    
    // 循環参照などでルートが見つからない場合は、最初のカードをルート扱いにする
    if (roots.length === 0 && cards.length > 0) {
        roots = [cards[0].id];
    }

    const allVisited = new Set();
    const components = [];

    // コンポーネント（連結成分）ごとに階層を計算する関数
    function processComponent(startNodes) {
        const componentNodes = [];
        const q = startNodes.map(id => ({ id, level: 0 }));
        startNodes.forEach(id => allVisited.add(id));
        
        const nodeLevels = {};
        startNodes.forEach(id => nodeLevels[id] = 0);

        while(q.length > 0) {
            const { id, level } = q.shift();
            componentNodes.push({ id, level });
            
            const kids = children[id] || [];
            kids.forEach(kidId => {
                if (!allVisited.has(kidId)) {
                    allVisited.add(kidId);
                    nodeLevels[kidId] = level + 1;
                    q.push({ id: kidId, level: level + 1 });
                }
            });
        }
        return componentNodes;
    }

    // 1. 自然なルートから探索
    if (roots.length > 0) {
        components.push(processComponent(roots));
    }

    // 2. まだ訪問していないノード（独立したグループや循環）を探索
    cards.forEach(c => {
        if (!allVisited.has(c.id)) {
            components.push(processComponent([c.id]));
        }
    });

    components.forEach(compNodes => {
        // コンポーネントの現在位置（バウンディングボックス）を計算
        let minX = Infinity;
        let minY = Infinity;
        compNodes.forEach(n => {
            const card = cards.find(c => c.id === n.id);
            if (card) {
                const x = parseFloat(card.el.style.left);
                const y = parseFloat(card.el.style.top);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
            }
        });

        if (minX === Infinity) minX = 4800;
        if (minY === Infinity) minY = 4800;

        // レベルごとにグループ化
        const levelGroups = {};
        compNodes.forEach(n => {
            if (!levelGroups[n.level]) levelGroups[n.level] = [];
            levelGroups[n.level].push(n.id);
        });

        let maxColHeight = 0;
        Object.values(levelGroups).forEach(col => {
            maxColHeight = Math.max(maxColHeight, col.length * spacingY);
        });

        const sortedLevels = Object.keys(levelGroups).map(Number).sort((a, b) => a - b);
        
        sortedLevels.forEach(lvl => {
            let colNodes = levelGroups[lvl];
            
            // 親の位置に基づいて並び替え（交差を減らす簡易的な処理）
            if (lvl > 0) {
                colNodes.sort((aId, bId) => {
                    const getAvgParentY = (id) => {
                        const myParents = parents[id] || [];
                        if (myParents.length === 0) return 0;
                        let sum = 0;
                        let count = 0;
                        myParents.forEach(pId => {
                            const pCard = cards.find(c => c.id === pId);
                            if (pCard) {
                                sum += pCard.baseY;
                                count++;
                            }
                        });
                        return count === 0 ? 0 : sum / count;
                    };
                    return getAvgParentY(aId) - getAvgParentY(bId);
                });
            }

            const colHeight = colNodes.length * spacingY;
            const colStartY = minY + (maxColHeight - colHeight) / 2;
            
            colNodes.forEach((id, index) => {
                const card = cards.find(c => c.id === id);
                if (card) {
                    const x = minX + lvl * spacingX;
                    const y = colStartY + index * spacingY;
                    
                    card.baseX = x;
                    card.baseY = y;
                    updateCardStyles(card.el, x, y, card.width, card.height);
                }
            });
        });
    });

    updateConnections();
    saveData();
}

let presSequence = [];
let currentSlideIndex = 0;

function findRootCard(cardId) {
    const parentConn = connections.find(c => c.to === cardId);
    if (parentConn) {
        return findRootCard(parentConn.from);
    }
    return cardId;
}

function startPresentation() {
    let rootCardId;
    if (selectedCards.size > 0) {
        rootCardId = selectedCards.values().next().value.id;
    } else {
        alert("プレゼンテーションを開始するには、開始点のカードを選択してください。");
        return;
    }

    const rootId = findRootCard(rootCardId);
    
    presSequence = [];
    const visited = new Set();
    
    function traverse(cardId) {
        if (visited.has(cardId)) return;
        visited.add(cardId);
        const cardObj = cards.find(c => c.id === cardId);
        if (!cardObj) return;
        const ta = cardObj.el.querySelector('textarea');
        presSequence.push({
            text: ta ? ta.value : '',
            color: cardObj.el.style.backgroundColor,
            imageUrl: cardObj.imageUrl || '',
            videoUrl: cardObj.videoUrl || '',
            linkUrl: cardObj.linkUrl || ''
        });
        const nextConns = connections.filter(c => c.from === cardId);
        nextConns.forEach(c => traverse(c.to));
    }

    traverse(rootId);
    
    if (presSequence.length === 0) return;
    currentSlideIndex = 0;
    document.getElementById('presentation-overlay').style.display = 'flex';
    document.getElementById('pres-total').innerText = presSequence.length;
    updateSlide();
}

function updateSlide() {
    const slide = presSequence[currentSlideIndex];
    const display = document.getElementById('presentation-card');
    const presImage = document.getElementById('pres-image');
    const presVideo = document.getElementById('pres-video');
    const presVideoIframe = document.getElementById('pres-video-iframe');
    
    document.getElementById('pres-content').innerText = slide.text;
    display.style.backgroundColor = slide.color;
    
    if (slide.imageUrl) {
        presImage.src = slide.imageUrl;
        presImage.style.display = 'block';
    } else {
        presImage.style.display = 'none';
    }

    if (slide.videoUrl) {
        const ytId = getYouTubeVideoId(slide.videoUrl);
        if (ytId) {
            presVideo.style.display = 'none';
            presVideo.pause();
            presVideoIframe.src = `https://www.youtube.com/embed/${ytId}`;
            presVideoIframe.style.display = 'block';
        } else {
            presVideoIframe.style.display = 'none';
            presVideoIframe.src = '';
            presVideo.src = slide.videoUrl;
            presVideo.style.display = 'block';
        }
    } else {
        presVideo.style.display = 'none';
        presVideo.pause();
        presVideoIframe.style.display = 'none';
        presVideoIframe.src = '';
    }
    
    document.getElementById('pres-current').innerText = currentSlideIndex + 1;
}

function nextSlide() { 
    if (currentSlideIndex < presSequence.length - 1) { 
        currentSlideIndex++; 
        updateSlide(); 
    } else {
        exitPresentation();
    }
}

function prevSlide() { 
    if (currentSlideIndex > 0) { 
        currentSlideIndex--; 
        updateSlide(); 
    } 
}

function exitPresentation() { 
    document.getElementById('presentation-overlay').style.display = 'none'; 
}

window.addEventListener('keydown', (e) => {
    const isInput = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';

    if (document.getElementById('presentation-overlay').style.display === 'flex') {
        if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'Escape') { exitPresentation(); return; }
        return;
    }

    // Save: Ctrl+S (入力中でも有効)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveData(true);
        return;
    }

    if (isInput) return;

    // Select All: Ctrl+A
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        cards.forEach(c => selectedCards.add(c.el));
        updateSelectionVisuals();
    }

    // Undo: Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    }
    // Redo: Ctrl+Shift+Z or Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
    }
    // Copy: Ctrl+C
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        copySelection();
    }
    // Paste: Ctrl+V
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault();
        pasteSelection();
    }
    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
    }
    if (e.key === 'Escape') hideContextMenu();
});

viewport.addEventListener('dblclick', (e) => {
    if (e.target === viewport || e.target === canvas) {
        saveState();
        const coords = screenToCanvas(e.clientX, e.clientY);
        addCard(coords.x - 110, coords.y - 75);
    }
});

function handleShare() {
    const btn = document.getElementById('share-btn');
    const urlParams = new URLSearchParams(window.location.search);
    const currentRoom = urlParams.get('room');

    if (currentRoom) {
        // 既にルームにいる場合はリンクをコピー
        navigator.clipboard.writeText(window.location.href).then(() => {
            showToast("リンクをコピーしました");
        });
    } else {
        // ルーム作成
        // セキュリティ向上のため、推測されにくいUUIDを使用する
        const roomId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        const newUrl = window.location.pathname + '?room=' + roomId;
        window.history.pushState({ path: newUrl }, '', newUrl);
        
        if (window.connectToRoom) {
            window.connectToRoom(roomId, myCursorId);
            showToast("部屋を作成しました");
        }
        
        // ボタンの見た目を更新
        updateShareButtonState(true);
    }
}
window.handleShare = handleShare;

function updateShareButtonState(hasRoom) {
    const btn = document.getElementById('share-btn');
    if (hasRoom) {
        btn.innerHTML = '<i class="bi bi-link-45deg"></i><span>共有</span>';
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-success');
    } else {
        btn.innerHTML = '<i class="bi bi-share"></i><span>共有</span>';
    }
}

function createUserNameModal() {
    if (document.getElementById('username-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'username-modal';
    modal.className = 'modal';
    
    let colorPaletteHtml = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; justify-content:center;">';
    USER_COLORS.forEach(color => {
        colorPaletteHtml += `<div class="color-dot user-color-option" data-color="${color}" style="background-color:${color};"></div>`;
    });
    colorPaletteHtml += '</div>';

    modal.innerHTML = `
        <div class="modal-content">
            <h3 style="margin-top:0; margin-bottom:16px; font-size:1.2rem; font-weight:bold;">ユーザー設定</h3>
            <div style="margin-bottom:8px; font-size:0.9rem; color:var(--text-sub); font-weight:bold;">名前</div>
            <input type="text" id="username-input" class="modal-input" placeholder="ユーザー名" maxlength="20" style="margin-top:0; margin-bottom:20px;">
            <div style="margin-bottom:12px; font-size:0.9rem; color:var(--text-sub); font-weight:bold;">カーソル色</div>
            ${colorPaletteHtml}
            <div class="modal-buttons">
                <button class="btn btn-secondary" id="username-cancel-btn">キャンセル</button>
                <button class="btn btn-primary" id="username-save-btn">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('username-cancel-btn').onclick = closeUserNameModal;
    document.getElementById('username-save-btn').onclick = saveUserName;
    
    const input = document.getElementById('username-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveUserName();
        if (e.key === 'Escape') closeUserNameModal();
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeUserNameModal();
    });

    // 色選択のイベント
    const colorOptions = modal.querySelectorAll('.user-color-option');
    colorOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('active-color'));
            opt.classList.add('active-color');
        });
    });
}

function changeUserName() {
    createUserNameModal();
    const modal = document.getElementById('username-modal');
    const input = document.getElementById('username-input');
    input.value = myUserName;
    
    // 現在の色を選択状態にする
    const colorOptions = modal.querySelectorAll('.user-color-option');
    colorOptions.forEach(opt => {
        if (opt.dataset.color === myCursorColor) {
            opt.classList.add('active-color');
        } else {
            opt.classList.remove('active-color');
        }
    });

    modal.style.display = 'flex';
    input.focus();
}

function closeUserNameModal() {
    const modal = document.getElementById('username-modal');
    if (modal) modal.style.display = 'none';
}

function saveUserName() {
    const input = document.getElementById('username-input');
    const newName = input.value.trim();
    
    // 選択された色を取得
    const activeColorBtn = document.querySelector('.user-color-option.active-color');
    const newColor = activeColorBtn ? activeColorBtn.dataset.color : myCursorColor;
    
    if (newName && newName !== "") {
        myUserName = newName;
        myCursorColor = newColor;
        localStorage.setItem('cardKnotUserName', myUserName);
        localStorage.setItem('cardKnotUserColor', myCursorColor);
        broadcastMyCursor();
        showToast("ユーザー設定を保存しました");
        closeUserNameModal();
    } else {
        showToast("ユーザー名を入力してください");
    }
}

function initUserName() {
    if (zoomPercentEl && zoomPercentEl.parentElement) {
        const separator = document.createElement('div');
        separator.className = 'zoom-separator';
        zoomPercentEl.parentElement.appendChild(separator);

        const btn = document.createElement('button');
        btn.className = 'zoom-btn';
        btn.innerHTML = '<i class="bi bi-person"></i>';
        btn.title = "ユーザー名変更";
        btn.onclick = changeUserName;
        zoomPercentEl.parentElement.appendChild(btn);
    }
}

window.onload = () => {
    if (!loadData()) {
        resetZoom();
        addCard(4800, 4800, "CardKnotへようこそ！");
    }
    setTimeout(updateTransform, 150);
    if (document.fonts) {
        document.fonts.ready.then(() => setTimeout(updateTransform, 0));
    }
    canvas.style.left = "0px";
    canvas.style.top = "0px";
    initDarkMode();
    createContextMenu();
    initMinimap();
    initUserName();

    // URLパラメータからルームIDを取得して接続
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        if (window.connectToRoom) window.connectToRoom(roomId, myCursorId);
        updateShareButtonState(true);
        showToast("部屋に参加しました");
    }
};

function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb || '#ffffff';
    const parts = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!parts) return '#ffffff';
    const r = parseInt(parts[1]).toString(16).padStart(2, '0');
    const g = parseInt(parts[2]).toString(16).padStart(2, '0');
    const b = parseInt(parts[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
}

function updateCardStyles(cardEl, baseX, baseY, width = null, height = null) {
    cardEl.style.left = baseX + 'px';
    cardEl.style.top = baseY + 'px';
    if (width) cardEl.style.width = width + 'px';
    else cardEl.style.width = '220px';
    if (height) cardEl.style.height = height + 'px';
    cardEl.style.minHeight = '150px';
    cardEl.style.fontSize = '16px';
}

function applyZoomUpdate() {
    // 背景ドットもscaleに合わせて更新
    viewport.style.backgroundSize = `${40 * scale}px ${40 * scale}px`;
}

function saveData(immediate = false) {
    if (isLoading) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    
    const saveAction = () => {
        const data = {
            ...serializeState(),
            view: { translateX, translateY, scale }
        };
        localStorage.setItem('cardKnotData', JSON.stringify(data));
        if (immediate) showToast("保存しました");

        // Supabaseへの保存（ルームにいる場合）
        if (window.saveRoomToDB) window.saveRoomToDB(data);
    };

    if (immediate) {
        saveAction();
    } else {
        saveTimeout = setTimeout(saveAction, 500);
    }
}

// リモートから初期データをロードする関数
window.loadFromRemote = function(data) {
    isRemoteUpdate = true;
    restoreState(data);
    isRemoteUpdate = false;
}

function loadData() {
    const json = localStorage.getItem('cardKnotData');
    if (!json) return false;
    
    isLoading = true;
    try {
        const data = JSON.parse(json);
        
        if (data.view) {
            translateX = data.view.translateX;
            translateY = data.view.translateY;
            scale = data.view.scale;
            updateTransform();
            applyZoomUpdate();
        }

        if (data.cards) {
            data.cards.forEach(c => {
                addCard(c.x, c.y, c.text, c.imageUrl, c.videoUrl, c.linkUrl, c.id, c.color, c.collapsed, c.pinned, c.favorite, c.type || 'text', c.width, c.height, c.linkTitle);
            });
        }

        if (data.connections) {
            connections = data.connections;
            // 折りたたみ状態の子要素非表示を適用
            cards.forEach(c => { if (c.collapsed) collapseChildren(c.id); });
            updateConnections();
        }
    } catch (e) {
        console.error("Failed to load data", e);
        isLoading = false;
        return false;
    }
    isLoading = false;
    return true;
}

function serializeCard(c) {
    const ta = c.el.querySelector('.card-textarea');
    return {
        id: c.id,
        x: parseFloat(c.el.style.left),
        y: parseFloat(c.el.style.top),
        text: ta ? ta.value : '',
        color: c.el.style.backgroundColor,
        imageUrl: c.imageUrl,
        videoUrl: c.videoUrl,
        linkUrl: c.linkUrl,
        collapsed: c.collapsed,
        linkTitle: c.linkTitle || c.el.querySelector('.card-link-title')?.textContent || '',
        pinned: c.pinned,
        favorite: c.favorite,
        type: c.type || 'text',
        width: c.width || parseFloat(c.el.style.width) || 220,
        height: c.height || parseFloat(c.el.style.height) || null
    };
}

function serializeState() {
    return {
        cards: cards.map(c => serializeCard(c)),
        connections: JSON.parse(JSON.stringify(connections))
    };
}

function saveState() {
    if (undoStack.length > 50) undoStack.shift();
    undoStack.push(serializeState());
    redoStack = [];
}

function restoreState(state) {
    // Clear existing
    cards.forEach(c => c.el.remove());
    cards = [];
    selectedCards.clear();
    updateToolbarColors(null);
    
    const lines = svgLayer.querySelectorAll('.connection-line');
    lines.forEach(l => l.remove());
    connections = [];

    // Restore
    state.cards.forEach(c => {
        addCard(c.x, c.y, c.text, c.imageUrl, c.videoUrl, c.linkUrl, c.id, c.color, c.collapsed, c.pinned, c.favorite, c.type || 'text', c.width, c.height, c.linkTitle);
    });
    connections = state.connections;
    cards.forEach(c => { if (c.collapsed) collapseChildren(c.id); });
    updateConnections();
    saveData();
}

function undo() {
    if (undoStack.length === 0) return;
    const prevState = undoStack.pop();
    redoStack.push(serializeState());
    restoreState(prevState);
}

function redo() {
    if (redoStack.length === 0) return;
    const nextState = redoStack.pop();
    undoStack.push(serializeState());
    restoreState(nextState);
}

function copySelection() {
    if (selectedCards.size === 0) return;
    const selectedIds = new Set();
    selectedCards.forEach(el => selectedIds.add(el.id));
    
    const cardsToCopy = cards.filter(c => selectedIds.has(c.id)).map(c => {
        const serialized = serializeCard(c);
        return {
            ...serialized,
            // serializeCardで取得済みだが念のため明示
            type: c.type || 'text'
        };
    });
    
    const connectionsToCopy = connections.filter(conn => 
        selectedIds.has(conn.from) && selectedIds.has(conn.to)
    );

    clipboard = { cards: cardsToCopy, connections: connectionsToCopy };
}

function pasteSelection(clientX = null, clientY = null) {
    if (!clipboard) return;
    saveState();
    clearSelection();
    
    const idMap = new Map();
    let dx = 30;
    let dy = 30;

    if (clientX !== null && clientY !== null) {
        let minX = Infinity;
        let minY = Infinity;
        clipboard.cards.forEach(c => {
            if (c.x < minX) minX = c.x;
            if (c.y < minY) minY = c.y;
        });
        const target = screenToCanvas(clientX, clientY);
        dx = target.x - minX;
        dy = target.y - minY;
    }

    clipboard.cards.forEach(c => {
        const newId = 'card-' + Math.random().toString(36).substr(2, 9);
        idMap.set(c.id, newId);
        addCard(c.x + dx, c.y + dy, c.text, c.imageUrl, c.videoUrl, c.linkUrl, newId, c.color, c.collapsed, c.pinned, c.favorite, c.type || 'text', c.width, c.height, c.linkTitle);
        addToSelection(document.getElementById(newId));
    });

    clipboard.connections.forEach(conn => {
        connections.push({
            from: idMap.get(conn.from),
            to: idMap.get(conn.to),
            fromSide: conn.fromSide,
            toSide: conn.toSide
        });
    });
    updateConnections();
    if (window.broadcastConnections) window.broadcastConnections(connections);
    saveData();
}

function openSearchModal() {
    hideContextMenu();
    document.getElementById('search-modal').style.display = 'flex';
    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    document.getElementById('search-results').innerHTML = '';
}

function closeSearchModal() {
    document.getElementById('search-modal').style.display = 'none';
}

function performSearch() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';

    if (!query) return;

    const matches = cards.filter(c => {
        const ta = c.el.querySelector('.card-textarea');
        const text = ta ? ta.value.toLowerCase() : '';
        const link = (c.linkUrl || '').toLowerCase();
        const title = (c.linkTitle || '').toLowerCase();
        return text.includes(query) || link.includes(query) || title.includes(query);
    });

    if (matches.length === 0) {
        resultsContainer.innerHTML = '<div class="p-4 text-center opacity-50">見つかりませんでした</div>';
        return;
    }

    matches.forEach(c => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        
        const ta = c.el.querySelector('.card-textarea');
        const textVal = ta ? ta.value : '';
        const displayText = textVal ? textVal.substring(0, 50) + (textVal.length > 50 ? '...' : '') : (c.linkTitle || c.linkUrl || '(テキストなし)');
        
        div.innerHTML = `
            <div class="search-result-text">${escapeHtml(displayText)}</div>
            <div class="search-result-sub">ID: ${c.id}</div>
        `;
        
        div.addEventListener('click', () => {
            navigateToCard(c.id);
            closeSearchModal();
        });
        
        resultsContainer.appendChild(div);
    });
}

function navigateToCard(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    selectSingleCard(card.el);
    const x = parseFloat(card.el.style.left);
    const y = parseFloat(card.el.style.top);
    scale = 1;
    const cardCenterX = x + 110;
    const cardCenterY = y + 75;
    translateX = (window.innerWidth / 2) - (cardCenterX * scale);
    translateY = (window.innerHeight / 2) - (cardCenterY * scale);
    updateTransform();
    applyZoomUpdate();
}

function createContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    document.body.appendChild(contextMenu);

    window.addEventListener('click', hideContextMenu);
    window.addEventListener('wheel', hideContextMenu);
}

function showContextMenu(x, y, type = 'card') {
    if (!contextMenu) return;
    contextMenuPosition = { x, y };
    
    let menuHtml = '';
    if (type === 'card') {
        let allPinned = true;
        let allFavorite = true;
        if (selectedCards.size > 0) {
            for (const el of selectedCards) {
                const card = cards.find(c => c.id === el.id);
                if (card) {
                    if (!card.pinned) allPinned = false;
                    if (!card.favorite) allFavorite = false;
                }
            }
        } else {
            allPinned = false;
            allFavorite = false;
        }
        menuHtml = `
            <div class="context-menu-item" data-action="copy"><i class="bi bi-clipboard"></i> コピー</div>
            <div class="context-menu-item" data-action="delete"><i class="bi bi-trash"></i> 削除</div>
            <div class="context-menu-item" data-action="pin"><i class="bi ${allPinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'}"></i> ${allPinned ? 'ピン留め解除' : 'ピン留め'}</div>
            <div class="context-menu-item" data-action="favorite"><i class="bi ${allFavorite ? 'bi-star-fill' : 'bi-star'}"></i> ${allFavorite ? 'お気に入り解除' : 'お気に入り'}</div>
        `;
    } else {
        menuHtml = `
            <div class="context-menu-item" data-action="paste"><i class="bi bi-clipboard-check"></i> 貼り付け</div>
            <div class="context-menu-item" data-action="undo"><i class="bi bi-arrow-counterclockwise"></i> 元に戻す</div>
            <div class="context-menu-item" data-action="redo"><i class="bi bi-arrow-clockwise"></i> やり直し</div>
        `;
    }

    // 共有中（ルームIDがある）ならリアクションメニューを追加
    const isSharing = new URLSearchParams(window.location.search).has('room');
    if (isSharing) {
        menuHtml += `
            <div class="h-px bg-gray-200 my-1"></div>
            <div class="context-menu-reactions">
                <div class="reaction-btn" data-emoji="👍">👍</div>
                <div class="reaction-btn" data-emoji="❤️">❤️</div>
                <div class="reaction-btn" data-emoji="😂">😂</div>
                <div class="reaction-btn" data-emoji="🎉">🎉</div>
                <div class="reaction-btn" data-emoji="😮">😮</div>
            </div>
        `;
    }

    contextMenu.innerHTML = menuHtml;

    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            handleContextMenuAction(action);
            hideContextMenu();
        });
    });

    contextMenu.querySelectorAll('.reaction-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const emoji = e.currentTarget.dataset.emoji;
            showReaction(contextMenuPosition.x, contextMenuPosition.y, emoji);
            if (window.broadcastReaction) {
                const coords = screenToCanvas(contextMenuPosition.x, contextMenuPosition.y);
                window.broadcastReaction({ x: coords.x, y: coords.y, emoji });
            }
            hideContextMenu();
        });
    });

    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    
    // 画面外にはみ出さないように調整
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) contextMenu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) contextMenu.style.top = (window.innerHeight - rect.height - 10) + 'px';
}

function hideContextMenu() {
    if (contextMenu) contextMenu.style.display = 'none';
}

function handleContextMenuAction(action) {
    if (action === 'copy') {
        if (selectedCards.size > 0) copySelection();
    } else if (action === 'paste') {
        pasteSelection(contextMenuPosition.x, contextMenuPosition.y);
    } else if (action === 'undo') {
        undo();
    } else if (action === 'redo') {
        redo();
    } else if (action === 'delete') {
        if (selectedCards.size > 0) deleteSelected();
    } else if (action === 'pin') {
        if (selectedCards.size > 0) {
            saveState();
            let allPinned = true;
            for (const el of selectedCards) {
                const card = cards.find(c => c.id === el.id);
                if (card && !card.pinned) {
                    allPinned = false;
                    break;
                }
            }
            const newState = !allPinned;
            selectedCards.forEach(el => {
                const card = cards.find(c => c.id === el.id);
                if (card) {
                    card.pinned = newState;
                    newState ? el.classList.add('pinned') : el.classList.remove('pinned');
                }
                if (window.broadcastCard) window.broadcastCard(serializeCard(card));
            });
            saveData();
        }
    } else if (action === 'favorite') {
        if (selectedCards.size > 0) {
            saveState();
            let allFavorite = true;
            for (const el of selectedCards) {
                const card = cards.find(c => c.id === el.id);
                if (card && !card.favorite) {
                    allFavorite = false;
                    break;
                }
            }
            const newState = !allFavorite;
            selectedCards.forEach(el => {
                const card = cards.find(c => c.id === el.id);
                if (card) {
                    card.favorite = newState;
                    newState ? el.classList.add('favorite') : el.classList.remove('favorite');
                }
                if (window.broadcastCard) window.broadcastCard(serializeCard(card));
            });
            saveData();
        }
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('cardKnotDarkMode', isDark);
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const btn = document.getElementById('dark-mode-btn');
    if (btn) btn.innerHTML = document.body.classList.contains('dark-mode') ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>';
}

function initDarkMode() {
    if (localStorage.getItem('cardKnotDarkMode') === 'true') document.body.classList.add('dark-mode');
    updateDarkModeIcon();
}

function updateMinimap() {
    const container = document.getElementById('minimap-container');
    if (!container || container.classList.contains('minimized')) return;
    const content = document.getElementById('minimap-content');
    const indicator = document.getElementById('minimap-viewport-indicator');

    const vTopLeft = screenToCanvas(0, 0);
    const vBottomRight = screenToCanvas(window.innerWidth, window.innerHeight);
    
    // キャンバスの基本サイズ(0~10000)を基準にして、マップが安定するようにする
    let minX = 0;
    let minY = 0;
    let maxX = 10000;
    let maxY = 10000;

    // カードがあれば範囲を拡張
    if (cards.length > 0) {
        cards.forEach(c => {
            const x = parseFloat(c.el.style.left);
            const y = parseFloat(c.el.style.top);
            const w = 220;
            const h = c.el.offsetHeight;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });
    }

    // ビューポートが範囲外なら拡張
    if (vTopLeft.x < minX) minX = vTopLeft.x;
    if (vTopLeft.y < minY) minY = vTopLeft.y;
    if (vBottomRight.x > maxX) maxX = vBottomRight.x;
    if (vBottomRight.y > maxY) maxY = vBottomRight.y;

    const padding = 2000;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;

    const mapWidth = container.clientWidth;
    const mapHeight = container.clientHeight;

    const scaleX = mapWidth / worldWidth;
    const scaleY = mapHeight / worldHeight;
    const minimapScale = Math.min(scaleX, scaleY);
    
    minimapState = { minX, minY, scale: minimapScale };

    let html = '';
    cards.forEach(c => {
        const x = parseFloat(c.el.style.left);
        const y = parseFloat(c.el.style.top);
        const w = 220;
        const h = c.el.offsetHeight;
        
        const mx = (x - minX) * minimapScale;
        const my = (y - minY) * minimapScale;
        const mw = w * minimapScale;
        const mh = h * minimapScale;
        
        let style = `left:${mx}px; top:${my}px; width:${mw}px; height:${mh}px;`;
        if (c.el.style.backgroundColor) {
            style += `background-color:${c.el.style.backgroundColor};`;
        }
        html += `<div class="minimap-card" style="${style}"></div>`;
    });
    content.innerHTML = html;

    const vx = (vTopLeft.x - minX) * minimapScale;
    const vy = (vTopLeft.y - minY) * minimapScale;
    const vw = (vBottomRight.x - vTopLeft.x) * minimapScale;
    const vh = (vBottomRight.y - vTopLeft.y) * minimapScale;

    indicator.style.left = `${vx}px`;
    indicator.style.top = `${vy}px`;
    indicator.style.width = `${vw}px`;
    indicator.style.height = `${vh}px`;
}

function initMinimap() {
    const container = document.getElementById('minimap-container');
    if (!container) return;

    const move = (e) => {
        const rect = container.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const wx = cx / minimapState.scale + minimapState.minX;
        const wy = cy / minimapState.scale + minimapState.minY;
        translateX = window.innerWidth / 2 - wx * scale;
        translateY = window.innerHeight / 2 - wy * scale;
        updateTransform();
        applyZoomUpdate();
    };

    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('#minimap-toggle')) return;
        isMinimapDragging = true;
        move(e);
    });
    window.addEventListener('mousemove', (e) => {
        if (isMinimapDragging) {
            e.preventDefault();
            move(e);
        }
    });
    window.addEventListener('mouseup', () => {
        isMinimapDragging = false;
    });

    // 初期状態の復元
    if (localStorage.getItem('cardKnotMinimapCollapsed') === 'true') {
        toggleMinimap(true);
    }
}

function toggleMinimap(forceMinimize = false) {
    const container = document.getElementById('minimap-container');
    if (forceMinimize) container.classList.add('minimized');
    else container.classList.toggle('minimized');
    
    const isMinimized = container.classList.contains('minimized');
    const btnIcon = container.querySelector('#minimap-toggle i');
    
    if (isMinimized) {
        btnIcon.className = 'bi bi-map';
        btnIcon.parentElement.title = "ミニマップを表示";
    } else {
        btnIcon.className = 'bi bi-chevron-down';
        btnIcon.parentElement.title = "ミニマップを最小化";
        updateMinimap();
        // アニメーション完了後に再描画して正しいサイズに合わせる
        setTimeout(updateMinimap, 310);
    }
    
    localStorage.setItem('cardKnotMinimapCollapsed', isMinimized);
}

async function fetchOGP(url) {
    try {
        // allorigins.win を使用してCORSを回避してHTMLを取得
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const html = data.contents;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const getMetaContent = (property) => {
            const element = doc.querySelector(`meta[property="${property}"]`) || doc.querySelector(`meta[name="${property}"]`);
            return element ? element.getAttribute('content') : null;
        };

        const title = getMetaContent('og:title') || doc.title || '';
        let image = getMetaContent('og:image') || '';
        
        // 相対パスの場合、絶対パスに変換
        if (image && !image.startsWith('http') && !image.startsWith('//')) {
            try {
                image = new URL(image, url).href;
            } catch (e) {
                // URL解析失敗時はそのまま
            }
        }

        return { title, image };
    } catch (error) {
        console.error('Failed to fetch OGP:', error);
        return null;
    }
}

async function autoFillLinkCardInfo() {
    const urlInput = document.getElementById('link-card-url');
    const titleInput = document.getElementById('link-card-title');
    const imageInput = document.getElementById('link-card-image');
    const fetchBtn = document.getElementById('link-card-fetch-btn');

    const url = urlInput.value.trim();
    if (!url) {
        showToast("URLを入力してください");
        return;
    }

    const originalBtnText = fetchBtn.innerHTML;
    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';

    const ogp = await fetchOGP(url);

    if (ogp) {
        if (ogp.title) titleInput.value = ogp.title;
        if (ogp.image) imageInput.value = ogp.image;
        showToast("情報を取得しました");
    } else {
        showToast("情報の取得に失敗しました");
    }

    fetchBtn.disabled = false;
    fetchBtn.innerHTML = originalBtnText;
}

function exportData() {
    const data = {
        ...serializeState(),
        view: { translateX, translateY, scale }
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const date = new Date();
    const timestamp = date.toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `cardknot_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("バックアップを保存しました");
}

function importData() {
    document.getElementById('import-file').click();
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // データの検証（簡易）
            if (!data.cards && !data.connections) {
                throw new Error("Invalid data format");
            }

            // 既存データのクリア
            cards.forEach(c => c.el.remove());
            cards = [];
            selectedCards.clear();
            updateToolbarColors(null);
            const lines = svgLayer.querySelectorAll('.connection-line');
            lines.forEach(l => l.remove());
            connections = [];

            // データの復元
            if (data.view) {
                translateX = data.view.translateX;
                translateY = data.view.translateY;
                scale = data.view.scale;
                updateTransform();
                applyZoomUpdate();
            }

            if (data.cards) {
                data.cards.forEach(c => {
                    addCard(c.x, c.y, c.text, c.imageUrl, c.videoUrl, c.linkUrl, c.id, c.color, c.collapsed, c.pinned, c.favorite, c.type || 'text', c.width, c.height, c.linkTitle);
                });
            }

            if (data.connections) {
                connections = data.connections;
                cards.forEach(c => { if (c.collapsed) collapseChildren(c.id); });
                updateConnections();
            }
            
            saveData(); // localStorageにも保存
            showToast("データを読み込みました");
            
        } catch (err) {
            console.error(err);
            showToast("ファイルの読み込みに失敗しました");
        }
        // inputをリセットして同じファイルを再度選べるようにする
        input.value = '';
    };
    reader.readAsText(file);
}

function showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function broadcastMyCursor() {
    if (window.broadcastCursor) {
        const selectedIds = Array.from(selectedCards).map(el => el.id);
        window.broadcastCursor({
            id: myCursorId,
            userName: myUserName,
            x: lastMousePos.x,
            y: lastMousePos.y,
            color: myCursorColor,
            lastActive: Date.now(),
            selectedIds: selectedIds
        });
    }
}

window.onRemoteCursorUpdate = function(data) {
    remoteCursors.set(data.id, data);
    renderRemoteCursors();
};

window.onRemoteCursorLeave = function(data) {
    remoteCursors.delete(data.id);
    renderRemoteCursors();
};

function renderRemoteCursors() {
    const now = Date.now();
    const activeSelections = new Set();
    const idsToDelete = [];

    remoteCursors.forEach((data, id) => {
        if (id === myCursorId) return;
        
        // 10秒以上更新がないカーソルは削除（通信切断対策）
        if (now - data.lastActive > 10000) {
             idsToDelete.push(id);
             return;
        }

        const displayName = data.userName || ('User ' + id.substr(0,4));
        let cursorEl = document.getElementById('cursor-' + id);
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.id = 'cursor-' + id;
            cursorEl.className = 'remote-cursor';
            cursorEl.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" style="fill:${escapeHtml(data.color)}; stroke:white; stroke-width:1px; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
                    <path d="M0 0L10 20L14 12L22 10L0 0Z"/>
                </svg>
                <div class="cursor-label" style="background-color:${escapeHtml(data.color)}">${escapeHtml(displayName)}</div>
            `;
            viewport.appendChild(cursorEl);
        } else {
            const label = cursorEl.querySelector('.cursor-label');
            if (label) {
                label.innerText = displayName;
                label.style.backgroundColor = data.color;
            }
            const svg = cursorEl.querySelector('svg');
            if (svg) {
                svg.style.fill = data.color;
            }
        }
        
        const screenX = data.x * scale + translateX;
        const screenY = data.y * scale + translateY;
        cursorEl.style.transform = `translate(${screenX}px, ${screenY}px)`;

        // 選択枠の描画
        if (data.selectedIds && Array.isArray(data.selectedIds)) {
            data.selectedIds.forEach(cardId => {
                const card = cards.find(c => c.id === cardId);
                if (card) {
                    const frameId = `sel-${cardId}-${id}`;
                    activeSelections.add(frameId);
                    
                    let frame = document.getElementById(frameId);
                    if (!frame) {
                        frame = document.createElement('div');
                        frame.id = frameId;
                        frame.className = 'remote-selection-frame';
                        frame.style.borderColor = data.color;
                        frame.innerHTML = `<div class="remote-selection-label" style="background-color:${escapeHtml(data.color)}">${escapeHtml(displayName)}</div>`;
                        card.el.appendChild(frame);
                    } else {
                        // 既存フレームの更新（色が変更された場合など）
                        frame.style.borderColor = data.color;
                        const label = frame.querySelector('.remote-selection-label');
                        if (label) {
                            label.style.backgroundColor = data.color;
                            label.innerText = displayName;
                        }
                        // 万が一DOMから外れていた場合は再追加
                        if (frame.parentElement !== card.el) {
                            card.el.appendChild(frame);
                        }
                    }
                }
            });
        }
    });

    // タイムアウトしたユーザーを削除
    idsToDelete.forEach(id => remoteCursors.delete(id));
    
    // 削除されたユーザーのカーソルを消去
    const activeIds = new Set(remoteCursors.keys());
    document.querySelectorAll('.remote-cursor').forEach(el => {
        const id = el.id.replace('cursor-', '');
        if (!activeIds.has(id)) {
            el.remove();
        }
    });

    // 非アクティブな選択枠を削除
    document.querySelectorAll('.remote-selection-frame').forEach(el => {
        if (!activeSelections.has(el.id)) {
            el.remove();
        }
    });
}

window.addEventListener('beforeunload', () => {
    if (window.broadcastLeave) window.broadcastLeave(myCursorId);
});

window.onRemoteCardUpdate = function(cardData) {
    isRemoteUpdate = true;
    const cardId = cardData.id;
    let card = cards.find(c => c.id === cardId);

    if (!card) {
        // 新規作成
        addCard(
            cardData.x, cardData.y, cardData.text, 
            cardData.imageUrl, cardData.videoUrl, cardData.linkUrl, 
            cardId, cardData.color, cardData.collapsed, 
            cardData.pinned, cardData.favorite, cardData.type, 
            cardData.width, cardData.height, cardData.linkTitle
        );
    } else {
        // 更新
        const isBeingDragged = isDragging && Array.from(selectedCards).some(el => el.id === cardId);
        if (!isBeingDragged) {
            // 構造的な変更（画像、動画、リンク、タイプ）がある場合は再作成
            const structuralChange = 
                (cardData.type !== undefined && card.type !== cardData.type) ||
                (cardData.imageUrl !== undefined && card.imageUrl !== cardData.imageUrl) ||
                (cardData.videoUrl !== undefined && card.videoUrl !== cardData.videoUrl) ||
                (cardData.linkUrl !== undefined && card.linkUrl !== cardData.linkUrl) ||
                (cardData.linkTitle !== undefined && card.linkTitle !== cardData.linkTitle);

            if (structuralChange) {
                const newCardData = { ...serializeCard(card), ...cardData };
                if (selectedCards.has(card.el)) selectedCards.delete(card.el);
                card.el.remove();
                cards = cards.filter(c => c.id !== cardId);
                addCard(newCardData.x, newCardData.y, newCardData.text, newCardData.imageUrl, newCardData.videoUrl, newCardData.linkUrl, cardId, newCardData.color, newCardData.collapsed, newCardData.pinned, newCardData.favorite, newCardData.type, newCardData.width, newCardData.height, newCardData.linkTitle);
                updateConnections();
                return;
            }

            // 位置
            if (cardData.x !== undefined && cardData.y !== undefined) {
                card.el.style.left = cardData.x + 'px';
                card.el.style.top = cardData.y + 'px';
                card.baseX = cardData.x;
                card.baseY = cardData.y;
                updateConnections();
            }
            // テキスト
            if (cardData.text !== undefined) {
                const ta = card.el.querySelector('.card-textarea');
                if (ta && ta.value !== cardData.text && document.activeElement !== ta) {
                    ta.value = cardData.text;
                }
            }
            // 色
            if (cardData.color !== undefined) {
                card.el.style.backgroundColor = cardData.color || '';
            }
            // サイズ
            if (cardData.width !== undefined) {
                card.width = cardData.width;
                card.height = cardData.height;
                card.el.style.width = cardData.width + 'px';
                if (cardData.height) card.el.style.height = cardData.height + 'px';
                updateConnections();
            }
            // 折りたたみ
            if (cardData.collapsed !== undefined && card.collapsed !== cardData.collapsed) {
                card.collapsed = cardData.collapsed;
                const icon = card.el.querySelector('.collapse-btn i');
                if (card.collapsed) {
                    card.el.classList.add('collapsed');
                    icon.className = 'bi bi-chevron-right';
                    collapseChildren(cardId);
                } else {
                    card.el.classList.remove('collapsed');
                    icon.className = 'bi bi-chevron-down';
                    expandChildren(cardId);
                }
                updateConnections();
            }
            // ピン・お気に入り
            if (cardData.pinned !== undefined) {
                card.pinned = cardData.pinned;
                card.pinned ? card.el.classList.add('pinned') : card.el.classList.remove('pinned');
            }
            if (cardData.favorite !== undefined) {
                card.favorite = cardData.favorite;
                card.favorite ? card.el.classList.add('favorite') : card.el.classList.remove('favorite');
            }
        }
    }
    isRemoteUpdate = false;
};

window.onRemoteReaction = function(data) {
    // キャンバス座標をスクリーン座標に変換して表示
    const screenX = data.x * scale + translateX;
    const screenY = data.y * scale + translateY;
    showReaction(screenX, screenY, data.emoji);
};

function showReaction(x, y, emoji) {
    const el = document.createElement('div');
    el.className = 'reaction-emoji';
    el.textContent = emoji;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);

    // アニメーション終了後に削除
    el.addEventListener('animationend', () => {
        el.remove();
    });
    // 万が一のためのタイムアウト
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 2000);
}

window.updateUserCount = function(count) {
    const el = document.getElementById('user-count');
    const numEl = document.getElementById('user-count-num');
    if (el && numEl) {
        numEl.innerText = count;
        el.classList.add('active');
    }
};
window.onRemoteDeleteCard = function(data) {
    isRemoteUpdate = true;
    const card = cards.find(c => c.id === data.id);
    if (card) {
        if (selectedCards.has(card.el)) selectedCards.delete(card.el);
        card.el.remove();
        cards = cards.filter(c => c.id !== data.id);
        updateConnections();
    }
    isRemoteUpdate = false;
};

window.onRemoteConnectionsUpdate = function(newConnections) {
    isRemoteUpdate = true;
    connections = newConnections;
    updateConnections();
    isRemoteUpdate = false;
};