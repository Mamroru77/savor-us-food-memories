const identity = require('../../utils/identity');
const identityCopy = require('../../utils/identityCopy');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
const store = require('../../utils/store');
const photos = require('../../utils/photos');
const avatarService = require('../../utils/avatar');

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
      const native = this._avatarNativeOwner;
      const preserving = !!native && active && (show || identity.snapshot().status === 'verifying');
      if (preserving && !show) native.suspended = true;
      if (show && this._avatarViewReady) {
        this._avatarViewReady();
        this._avatarViewReady = null;
      }
      if (!preserving && (!active || !show)) this.reset();
      if (active && show) this.refresh();
    },
  },

  lifetimes: {
    attached() {
      this.unsubscribe = store.subscribe(function (state) {
        const session = state.identity;
        if (this._avatarNativeOwner && session) {
          if (session.locked && session.status === 'verifying') {
            this._identityGeneration = session.generation;
            return;
          }
          if (session.locked || session.userId !== this._avatarNativeOwner.userId) {
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
    },
    detached() {
      this._detached = true;
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

    finishAvatar(request) {
      if (!this._avatarNativeOwner || this._avatarNativeOwner.request !== request) return;
      this._avatarNativeOwner = null;
      this.triggerEvent('nativeavatar', { phase: 'end', request });
    },

    reset() {
      if (this._avatarViewReady) {
        this._avatarViewReady();
        this._avatarViewReady = null;
      }
      if (this._avatarNativeOwner) this.finishAvatar(this._avatarNativeOwner.request);
      this._formEdits = {};
      this._avatarRequest = (this._avatarRequest || 0) + 1;
      if (!this._detached) this.setData({ profileUploading: false, profileError: '' });
    },

    markFormEdit(field) {
      (this._formEdits || (this._formEdits = {}))[field] = true;
    },

    refresh() {
      const state = store.get();
      const edited = this._formEdits || {};
      const patch = { copy: i18n.copy(), profileUploading: !!this._avatarNativeOwner };
      if (!edited.profileName) patch.profileName = state.profile.name;
      if (!edited.profileBio) patch.profileBio = state.profile.bio;
      if (!edited.profileAvatar) patch.profileAvatar = state.profile.avatar;
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

    onAvatarChange(event) {
      const tempPath = event && event.detail && event.detail.avatarUrl;
      if (!tempPath || this._detached || !this.data.active || !this.data.show) return Promise.resolve();
      const that = this;
      const request = this._avatarRequest = (this._avatarRequest || 0) + 1;
      const active = () => !that._detached && that.data.active && that.data.show && request === that._avatarRequest;
      let owner;
      try {
        owner = identity.lease();
        that._avatarNativeOwner = { userId: owner.userId, request };
        that.triggerEvent('nativeavatar', { phase: 'start', userId: owner.userId, request });
      } catch (error) {
        photos.logFailure(error, 'identity');
        that.setData({ profileUploading: false, profileError: identityCopy().verify });
        return Promise.resolve();
      }
      that.setData({ profileUploading: true, profileError: '' });
      return avatarService.prepare(tempPath, owner, 'chooseAvatar').then(async function (asset) {
        if (!that.data.show && that._avatarNativeOwner && that._avatarNativeOwner.request === request && that._avatarNativeOwner.suspended) {
          await new Promise(resolve => { that._avatarViewReady = resolve; });
        }
        if (!active()) return;
        try {
          owner = await identity.resumeNative(owner);
        } catch (error) {
          throw photos.logFailure(error, 'identity');
        }
        if (active() && asset.localPath) {
          that.markFormEdit('profileAvatar');
          that.setData({ profileAvatar: asset.localPath, profileUploading: false, imageErrors: {} });
        } else if (active()) {
          that.setData({ profileUploading: false, profileError: i18n.t('Could not prepare the photo. Please select it again.') });
        }
      }).catch(function (error) {
        const cancelled = photos.isCancelled(error);
        const reported = cancelled ? null : photos.logFailure(error);
        if (!active()) return;
        if (cancelled) {
          that.setData({ profileUploading: false });
          return;
        }
        const message = reported.category === 'identity' ? identityCopy().verify
          : reported.category === 'filesystem' ? 'Could not save. Free some storage and try again.'
          : 'Could not prepare the photo. Please select it again.';
        that.setData({ profileUploading: false, profileError: i18n.t(message) });
      }).finally(function () {
        that.finishAvatar(request);
      });
    },

    onProfileSave() {
      if (this.data.profileUploading || this._avatarNativeOwner) return;
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
        store.updateProfile({ name, bio: this.data.profileBio.trim(), avatar: this.data.profileAvatar });
        photos.pruneOrphans(photos.collectReferenced(store.get()));
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
