// 화면(renderer)이 쓸 수 있는 것만 좁게 열어 준다.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sasu', {
  info: () => ipcRenderer.invoke('app:info'),
  chat: (text, repo) => ipcRenderer.invoke('chat:send', { text, repo }),
  resetChat: repo => ipcRenderer.invoke('chat:reset', repo),
  review: id => ipcRenderer.invoke('review:get', id),
  openPR: id => ipcRenderer.send('review:open-pr', id),
  notices: () => ipcRenderer.invoke('notices:get'),
  setName: name => ipcRenderer.invoke('name:set', name),
  readNotice: id => ipcRenderer.send('notices:read', id || null),
  interactive: on => ipcRenderer.send('ui:interactive', on),
  drag: (dx, dy) => ipcRenderer.send('ui:drag', { dx, dy }),
  dragEnd: () => ipcRenderer.send('ui:drag-end'),
  focus: () => ipcRenderer.send('ui:focus'),
  on: (channel, fn) => {
    const allowed = ['mood', 'bubble', 'open-review', 'open-notices', 'notices', 'ask-name', 'dnd', 'reload'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  },
});
