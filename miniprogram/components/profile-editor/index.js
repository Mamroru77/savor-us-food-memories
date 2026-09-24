const identity = require('../../utils/identity');
const identityCopy = require('../../utils/identityCopy');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
const store = require('../../utils/store');
const photos = require('../../utils/photos');
const avatarService = require('../../utils/avatar');
const nativeFlow = require('../../utils/nativeFlow');

// Native-return visibility barrier. The custom chooser (wx.chooseMedia) backgrounds the mini
// program, so App.onShow re-verifies identity while the avatar flow is still in flight — and the
// chooser's success callback can reach the JS layer before that re-verification starts.
// nativeFlow.run() resumes only once before its task, so a lease taken before the generation moves
// goes stale inside persistPhoto's ~250 ms compressImage step, where the second assertOwner rejects
// the original with STALE_IDENTITY and the photo is never written. Add's photo path already waits
// for the page to become visible again before resuming; this is the same barrier for the component
// that owns this flow. It cannot use the `show` property: backgrounding the app does not change it.
// The fallback bounds the wait so an identity path that never reports progress cannot strand a flow.
const NATIVE_RETURN_FALLBACK_MS = 250;

Component({
  properties: {
    active: { type: Boolean, value: false },
    show: { type: Boolean, value: false },
    dusk: { type: Boolean, value: false },
  },

  data: {
    copy: i18n.copy(),
    focusedField: '',
    imageErrors: {},
    profileName: '',
    profileBio: '',
    profileAvatar: '',
    profileError: '',
    profileUploading: false,
  },

  observers: {
    'active, show': function (active, show) {
      const flow = this._avatarFlow;
      const preserving = active && (show || identity.snapshot().status === 'verifying')
        && ((!!flow && flow.active()) || !!this._avatarRequest);
      if (preserving && flow && !show) flow.suspend();
      if (preserving && flow && show) flow.show();
      if (!preserving && (!active || !show)) this.reset();
      if (active && show) this.refresh();
    },
  },

  lifetimes: {
    attached() {
      this.unsubscribe = store.subscribe(function (state) {
        // App.onShow's re-verification reaches the editor through the Store, so this is the moment a
        // suspended flow may resume: the generation has already moved, which is what makes the
        // lease nativeFlow.run() is about to take current again.
        this.releaseNativeReturn();
        const session = state.identity;
        const flow = this._avatarFlow;
        const owner = flow && flow.active() ? { userId: flow.userId } : this._avatarRequest && this._avatarRequest.owner;
        if (owner && session) {
          if (session.locked && session.status === 'verifying') {
            this._identityGeneration = session.generation;
            return;
          }
          if (session.locked || session.userId !== owner.userId) {
            this.reset();
            this.setData({ profileName: '', profileBio: '', profileAvatar: '', profileError: '', imageErrors: {} });
            this.triggerEvent('close', { reason: 'identity' });
            return;
          }
          this._identityGeneration = session.generation;
        } else if (session && this._identityGeneration !== session.generation) {
          this._identityGeneration = session.generation;
          this.reset();
          this.setData({ profileName: '', profileBio: '', profileAvatar: '', profileError: '', imageErrors: {} });
          this.triggerEvent('close', { reason: 'identity' });
          return;
        }
        if (this.data.active && this.data.show) this.refresh();
      }.bind(this));
      const state = store.get();
      this._identityGeneration = state.identity && state.identity.generation;
      if (this.data.active && this.data.show) this.refresh();
      // A native chooser backgrounds the app without changing this component's `show` property, so
      // the observer above cannot see the round trip at all. Watch the app lifecycle directly.
      if (typeof wx !== 'undefined' && typeof wx.onAppHide === 'function') {
        this._onAppHide = function () {
          this._nativeHiddenGeneration = identity.snapshot().generation;
          const flow = this._avatarFlow;
          if (flow && flow.active()) flow.suspend();
        }.bind(this);
        this._onAppShow = function () {
          this._nativeReturnPending = true;
          this.releaseNativeReturn();
        }.bind(this);
        wx.onAppHide(this._onAppHide);
        wx.onAppShow(this._onAppShow);
      }
    },
    detached() {
      this._detached = true;
      this.clearNativeReturn();
      if (typeof wx !== 'undefined' && typeof wx.offAppHide === 'function' && this._onAppHide) wx.offAppHide(this._onAppHide);
      if (typeof wx !== 'undefined' && typeof wx.offAppShow === 'function' && this._onAppShow) wx.offAppShow(this._onAppShow);
      this._onAppHide = null;
      this._onAppShow = null;
      this.reset();
      if (this.unsubscribe) this.unsubscribe();
    },
  },

  methods: {
    onFieldFocus: uiFeedback.onFieldFocus,
    onFieldBlur: uiFeedback.onFieldBlur,

    onImageError(event) {
      uiFeedback.onImageError.call(this, event);
      if (this.data.profileAvatar && event.currentTarget.dataset.source === this.data.profileAvatar) {
        photos.logFailure({ code: 'IMAGE_LOAD_FAILED' }, 'preview');
        this.setData({ profileError: i18n.t('Could not prepare the photo. Please select it again.') });
      }
    },

    reset() {
      this.clearNativeReturn();
      if (this._avatarFlow) this._avatarFlow.cancel();
      this._avatarFlow = null;
      this._avatarRequest = null;
      this._avatarUploading = false;
      this._profileAvatarAsset = null;
      this._formEdits = {};
      if (!this._detached) this.setData({ profileUploading: false, profileError: '' });
    },

    markFormEdit(field) {
      (this._formEdits || (this._formEdits = {}))[field] = true;
    },

    // Resume a flow that the app backgrounding suspended — but only once the onShow re-verification
    // has actually started. Resuming earlier would let nativeFlow.run() take a lease from before the
    // generation moved, and persistPhoto's post-compression assertOwner rejects exactly that
    // (STALE_IDENTITY), so the chosen original is silently dropped. Either signal is enough because
    // wx.onAppShow and App.onShow are separate registrations with no documented order between them.
    releaseNativeReturn() {
      if (!this._nativeReturnPending) return;
      const session = identity.snapshot();
      if (session.generation !== this._nativeHiddenGeneration || session.status === 'verifying') {
        this.showSuspendedFlow();
        return;
      }
      if (!this._nativeReturnTimer) {
        this._nativeReturnTimer = setTimeout(function () {
          this._nativeReturnTimer = null;
          this.showSuspendedFlow();
        }.bind(this), NATIVE_RETURN_FALLBACK_MS);
      }
    },

    showSuspendedFlow() {
      this.clearNativeReturn();
      const flow = this._avatarFlow;
      if (!flow || !flow.active()) return;
      // Backgrounding is not the only reason a flow can be suspended: the observer suspends it while
      // the editor is hidden, and only the observer's own show() may resume it in that case.
      if (!this.data.active || !this.data.show) return;
      flow.show();
    },

    clearNativeReturn() {
      this._nativeReturnPending = false;
      if (this._nativeReturnTimer) { clearTimeout(this._nativeReturnTimer); this._nativeReturnTimer = null; }
    },

    refresh() {
      const state = store.get();
      const edited = this._formEdits || {};
      const patch = { copy: i18n.copy(), profileUploading: !!this._avatarUploading };
      if (!edited.profileName) patch.profileName = state.profile.name;
      if (!edited.profileBio) patch.profileBio = state.profile.bio;
      if (!edited.profileAvatar) {
        this._profileAvatarAsset = state.profile.avatarAsset;
        patch.profileAvatar = state.profile.avatar;
      }
      this.setData(patch);
    },

    onProfileName(event) {
      this.markFormEdit('profileName');
      this.setData({ profileName: event.detail.value, profileError: '' });
    },

    onProfileBio(event) {
      this.markFormEdit('profileBio');
      this.setData({ profileBio: event.detail.value });
    },

    onAvatarRequest() {
      if (this._detached || !this.data.active || !this.data.show) return;
      try {
        const owner = identity.lease();
        // The flow must exist before the native chooser opens. A custom/system photo
        // round trip re-verifies identity, and Sheet/Me preserve an avatar round trip
        // only through nativeFlow — so the flow cannot wait for the callback.
        const flow = nativeFlow.begin(owner);
        this._avatarRequest = { owner, flow };
        this._avatarFlow = flow;
        // A newer chooser supersedes any upload still in flight: its result is discarded
        // (active() no longer matches), so it must not keep holding the Save lock.
        this._avatarUploading = false;
        this.setData({ profileUploading: false });
      } catch (error) {
        this._avatarRequest = null;
        this._avatarFlow = null;
        photos.logFailure(error, 'identity');
        this.setData({ profileError: identityCopy().verify });
      }
    },

    onAvatarChange(event) {
      const tempPath = event && event.detail && event.detail.avatarUrl;
      return this.completeAvatarSelection(tempPath, 'chooseAvatar');
    },

    // Custom-avatar entry. The WeChat chooseAvatar button hands back its own small derivative, so a
    // custom photo is selected through the system chooser (wx.chooseMedia, sizeType 'original')
    // instead. That is a native round trip like any other: the flow is created before the chooser
    // opens, the chooser result is handed to the same completeAvatarSelection path, and the owner is
    // re-authorized by the flow — so a superseded, closed or differently-owned result is dropped.
    async onAvatarCustomRequest() {
      if (this._detached || !this.data.active || !this.data.show) return;
      let owner;
      try {
        owner = identity.lease();
        const flow = nativeFlow.begin(owner);
        this._avatarRequest = { owner, flow };
        this._avatarFlow = flow;
        this._avatarUploading = false;
        this.setData({ profileUploading: false });
      } catch (error) {
        this._avatarRequest = null;
        this._avatarFlow = null;
        photos.logFailure(error, 'identity');
        this.setData({ profileError: identityCopy().verify });
        return;
      }
      const request = this._avatarRequest;
      let tempPath = '';
      try { tempPath = await avatarService.chooseLocal(owner); }
      catch (error) {
        const reported = photos.logFailure(error, 'avatar');
        if (this._avatarRequest === request && !this._detached && this.data.active) {
          this.setData({ profileError: reported.category === 'identity' ? identityCopy().verify : i18n.t('Could not prepare the photo. Please select it again.') });
        }
      }
      // A newer request, a closed editor or a detach owns the outcome now. This chooser's result
      // must never be handed to whatever request happens to be current.
      if (this._avatarRequest !== request) return;
      return this.completeAvatarSelection(tempPath, 'album');
    },

    completeAvatarSelection(tempPath, source) {
      const request = this._avatarRequest;
      // Visibility belongs to the flow, not to this guard. The system chooser round trip
      // hides the editor; a still-authorized request must be handed to flow.run, which
      // waits until the editor is visible again instead of dropping the native result.
      if (!tempPath || !request || this._detached || !this.data.active || !request.flow.active()) {
        if (this._avatarRequest === request) this._avatarRequest = null;
        // A native callback that carries no usable result ends this request: release its
        // pending flow so the editor is not preserved for a chooser that is already over.
        if (request && !this._avatarUploading && this._avatarFlow === request.flow) {
          this._avatarFlow.cancel();
          this._avatarFlow = null;
          this.setData({ profileUploading: false });
        }
        return Promise.resolve();
      }
      const that = this;
      const flow = request.flow;
      that._avatarRequest = null;
      const active = () => !that._detached && that.data.active && that.data.show && that._avatarFlow === flow && flow.active();
      that._avatarUploading = true;
      that.setData({ profileUploading: true, profileError: '' });
      return flow.run(token => avatarService.prepare(tempPath, token, source)).then(function (result) {
        if (!active() || result.status === 'cancelled') return;
        if (result.status === 'stale-owner') {
          photos.logFailure({ code: 'STALE_IDENTITY' }, 'identity');
          that.setData({ profileError: identityCopy().verify });
          return;
        }
        const asset = result.value;
        if (active() && asset.localPath) {
          that.markFormEdit('profileAvatar');
          that._profileAvatarAsset = asset;
          that.setData({ profileAvatar: asset.localPath, profileUploading: false, imageErrors: {} });
        } else if (active()) {
          that.setData({ profileUploading: false, profileError: i18n.t('Could not prepare the photo. Please select it again.') });
        }
      }).catch(function (error) {
        const reported = photos.logFailure(error);
        if (that._detached || !that.data.active || !that.data.show || that._avatarFlow !== flow) return;
        const message = reported.category === 'identity' ? identityCopy().verify
          : reported.category === 'filesystem' ? 'Could not save. Free some storage and try again.'
          : 'Could not prepare the photo. Please select it again.';
        that.setData({ profileUploading: false, profileError: i18n.t(message) });
      }).finally(function () {
        if (that._avatarRequest === request) that._avatarRequest = null;
        if (that._avatarFlow !== flow) return;
        that._avatarUploading = false;
        flow.finish();
        that._avatarFlow = null;
        if (!that._detached && that.data.active && that.data.show) that.setData({ profileUploading: false });
      });
    },

    onProfileSave() {
      // A pending chooser holds a flow but is not uploading; only persistence blocks Save.
      if (this._avatarUploading) return;
      if (this.data.profileAvatar && this.data.imageErrors[this.data.profileAvatar]) {
        this.setData({ profileError: i18n.t('Could not prepare the photo. Please select it again.') });
        return;
      }
      const name = this.data.profileName.trim();
      if (!name) {
        this.setData({ profileError: i18n.t('Your name cannot be empty.') });
        this.triggerEvent('scrolltarget', { id: 'profile-name-field' });
        return;
      }
      try {
        store.updateProfile({ name, bio: this.data.profileBio.trim(), avatarAsset: this._profileAvatarAsset });
        store.notify(i18n.t('A little more you. Profile updated.'));
        this.reset();
        this.triggerEvent('close');
      } catch (error) {
        const reported = photos.logFailure(error, 'profile-save');
        this.setData({ profileError: reported.category === 'identity' ? identityCopy().verify : i18n.t('Could not save. Free some storage and try again.') });
      }
    },
  },
});
