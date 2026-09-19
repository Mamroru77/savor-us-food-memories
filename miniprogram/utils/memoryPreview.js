// Temporary reading intent, not an identity exception or a persisted Memory copy.
const identity = require('./identity');
const store = require('./store');

function open(page, detail) {
  if (!detail || !detail.memoryId || !Array.isArray(detail.images) || !detail.images.length) return;
  if (page._memoryPreview) page._memoryPreview.cancel();
  const token = identity.lease();
  const position = {memoryId:detail.memoryId, scrollTop:Math.max(0, Number(detail.scrollTop) || 0), photoIndex:Math.max(0, Number(detail.photoIndex) || 0)};
  const parentPosition = {scrollTop:Math.max(0, Number(page._memoryParentScrollTop) || 0), galleryLeft:Math.max(0, Number(page._memoryGalleryScrollLeft) || 0)};
  let unsubscribe, resuming = false, launched = false, released = false;
  const temporary = new Set();
  const removeTemporary = path => { try { wx.getFileSystemManager().unlinkSync(path); } catch (error) { /* Only our generated viewer copies; never original photo references. */ } };
  const ownTemporary = path => { if (released) removeTemporary(path); else temporary.add(path); };
  const ticket = {
    cancel() {
      released = true;
      temporary.forEach(removeTemporary); temporary.clear();
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (page._memoryPreview === ticket) page._memoryPreview = null;
    },
  };
  page._memoryPreview = ticket;
  unsubscribe = identity.subscribe(session => {
    // Existing identity/page logic still redacts and unmounts private content.
    // Revocation/failed verification is not a preview return.
    if (session.status === 'blocked' || session.status === 'unknown') { ticket.cancel(); return; }
    // An ordinary background/identity transition while files are preparing is
    // not a native-preview return, and must not open or restore private UI.
    if (!launched) {
      if (session.locked || session.generation !== token.generation) ticket.cancel();
      return;
    }
    if (session.locked || session.generation === token.generation || resuming) return;
    resuming = true;
    identity.resumeNative(token).then(next => {
      if (page._memoryPreview !== ticket) return;
      identity.assertLease(next);
      const pages = getCurrentPages();
      if (pages[pages.length - 1] !== page) return;
      if (!store.get().memories.some(memory => memory.id === position.memoryId)) return;
      page.setData({sheetShow:true, sheetType:'memory', sheetMemoryId:position.memoryId, sheetFilter:'', sheetReadingPosition:position}, () => {
        const currentPages = getCurrentPages();
        if (identity.isCurrent(next) && currentPages[currentPages.length - 1] === page && page.data.sheetShow && page.data.sheetMemoryId === position.memoryId && page.restoreMemoryParent) page.restoreMemoryParent(parentPosition);
      });
    }).catch(() => { /* Locked, different owner or stale: never restore private UI. */ })
      .finally(() => ticket.cancel());
  });
  const launch = urls => {
    launched = true;
    wx.previewImage({current:urls[position.photoIndex] || urls[0], urls,
      fail:() => ticket.cancel()});
  };
  if (detail.images.some(source => typeof source === 'string' && (source.startsWith('/images/') || source.startsWith('cloud://')))) {
    return Promise.resolve().then(() => {
      if (page._memoryPreview !== ticket) return [];
      return require('./nativePreviewSources').resolve(detail.images, token, ownTemporary);
    }).then(urls => {
      if (page._memoryPreview !== ticket) return;
      identity.assertLease(token);
      const pages = getCurrentPages();
      if (pages[pages.length - 1] !== page || !page.data.sheetShow || (page.data.sheetMemoryId && page.data.sheetMemoryId !== position.memoryId)) { ticket.cancel(); return; }
      launch(urls);
    }).catch(() => ticket.cancel());
  }
  try { launch(detail.images); }
  catch (error) { ticket.cancel(); throw error; }
}
module.exports = {open};
