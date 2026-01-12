// network.js
import { createClient } from '@supabase/supabase-js';

// Supabaseのプロジェクト設定 (ご自身のものに書き換えてください)
const SUPABASE_URL = 'https://cblrceabckkxbpfulnec.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cj9UcQEvvJppBB11UxgNxQ_wcY4nqJK';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentChannel = null;
let currentRoomId = null;
let lastSaveTime = 0;

// 部屋に接続
window.connectToRoom = async (roomId, userId) => {
    currentRoomId = roomId;
    console.log(`接続します: ${roomId}`);

    // 1. DBから初期データをロード
    const { data, error } = await supabase.rpc('get_room', { room_id: roomId });

    if (data) {
        if (window.loadFromRemote) window.loadFromRemote(data);
    }

    // 2. Realtimeチャンネルに接続（Broadcastで軽量な更新をやり取り）
    if (currentChannel) supabase.removeChannel(currentChannel);

    currentChannel = supabase.channel(`room:${roomId}`, {
        config: {
            presence: { key: userId },
        },
    })
        .on('broadcast', { event: 'card_update' }, ({ payload }) => {
            if (window.onRemoteCardUpdate) window.onRemoteCardUpdate(payload);
        })
        .on('broadcast', { event: 'delete_card' }, ({ payload }) => {
            if (window.onRemoteDeleteCard) window.onRemoteDeleteCard(payload);
        })
        .on('broadcast', { event: 'connections_update' }, ({ payload }) => {
            if (window.onRemoteConnectionsUpdate) window.onRemoteConnectionsUpdate(payload);
        })
        .on('broadcast', { event: 'cursor' }, ({ payload }) => {
            if (window.onRemoteCursorUpdate) window.onRemoteCursorUpdate(payload);
        })
        .on('broadcast', { event: 'cursor_leave' }, ({ payload }) => {
            if (window.onRemoteCursorLeave) window.onRemoteCursorLeave(payload);
        })
        .on('broadcast', { event: 'reaction' }, ({ payload }) => {
            if (window.onRemoteReaction) window.onRemoteReaction(payload);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            if (key !== userId && window.showToast) window.showToast("誰かが入室しました");
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            if (key !== userId && window.showToast) window.showToast("誰かが退出しました");
        })
        .on('presence', { event: 'sync' }, () => {
            const newState = currentChannel.presenceState();
            const count = Object.keys(newState).length;
            if (window.updateUserCount) window.updateUserCount(count);
        })
        .subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('接続完了');
                await currentChannel.track({ online_at: new Date().toISOString() });
            } else if (status === 'CHANNEL_ERROR') {
                console.error('Realtime接続エラー:', err);
                if (window.showToast) window.showToast("接続エラーが発生しました");
            }
        });
};

// DBへの保存（script.jsのsaveDataから呼ばれる）
window.saveRoomToDB = async (state) => {
    if (!currentRoomId) return;
    
    // 短時間の連打防止（1秒に1回まで）
    const now = Date.now();
    if (now - lastSaveTime < 1000) return;
    lastSaveTime = now;

    await supabase.rpc('save_room', { room_id: currentRoomId, room_content: state });
};

// 各種ブロードキャスト関数
window.broadcastCard = (cardData) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'card_update', payload: cardData });
    }
};
window.broadcastDelete = (cardId) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'delete_card', payload: { id: cardId } });
    }
};
window.broadcastConnections = (connections) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'connections_update', payload: connections });
    }
};
window.broadcastCursor = (cursorData) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'cursor', payload: cursorData });
    }
};
window.broadcastLeave = (cursorId) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'cursor_leave', payload: { id: cursorId } });
    }
};
window.broadcastReaction = (reactionData) => {
    if (currentChannel) {
        currentChannel.send({ type: 'broadcast', event: 'reaction', payload: reactionData });
    }
};