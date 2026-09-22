const identity = require('../../utils/identity');
const identityCopy = require('../../utils/identityCopy');
const i18n = require('../../utils/i18n');
const uiFeedback = require('../../utils/uiFeedback');
const store = require('../../utils/store');
const photos = require('../../utils/photos');
const avatarService = require('../../utils/avatar');
const nativeFlow = require('../../utils/nativeFlow');

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

    reset() {
      if (this._avatarFlow) this._avatarFlow.cancel();
      this._avatarFlow = null;
      this._avatarRequest = null;
      this._profileAvatarAsset = null;
      this._formEdits = {};
      if (!this._detached) this.setData({ profileUploading: false, profileError: '' });
    },

    markFormEdit(field) {
      (this._formEdits || (this._formEdits = {}))[field] = true;
    },

    refresh() {
      const state = store.get();
      const edited = this._formEdits || {};
      const patch = { copy: i18n.copy(), profileUploading: !!this._avatarFlow && this._avatarFlow.active() };
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
        this._avatarRequest = { owner: identity.lease() };
      } catch (error) {
        this._avatarRequest = null;
        photos.logFailure(error, 'identity');
        this.setData({ profileError: identityCopy().verify });
      }
    },

    onAvatarChange(event) {
      const tempPath = event && event.detail && event.detail.avatarUrl;
      const request = this._avatarRequest;
      if (!tempPath || !request || this._detached || !this.data.active || !this.data.show) {
        if (this._avatarRequest === request) this._avatarRequest = null;
        return Promise.resolve();
      }
      const that = this;
      let flow;
      const activeRequest = () => !that._detached && that.data.active && that._avatarRequest === request;
      return identity.resumeNative(request.owner).then(function (owner) {
        if (!activeRequest()) return;
        that._avatarRequest = null;
        flow = nativeFlow.begin(owner);
        that._avatarFlow = flow;
        if (!that.data.show) flow.suspend();
        const active = () => !that._detached && that.data.active && that.data.show && that._avatarFlow === flow && flow.active();
        that.setData({ profileUploading: true, profileError: '' });
        return flow.run(token => avatarService.prepare(tempPath, token, 'chooseAvatar')).then(function (result) {
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
        });
      }).catch(function (error) {
        const reported = photos.logFailure(error);
        if (that._detached || !that.data.active || !that.data.show || (flow && that._avatarFlow !== flow)) return;
        const message = reported.category === 'identity' ? identityCopy().verify
          : reported.category === 'filesystem' ? 'Could not save. Free some storage and try again.'
          : 'Could not prepare the photo. Please select it again.';
        that.setData({ profileUploading: false, profileError: i18n.t(message) });
      }).finally(function () {
        if (that._avatarRequest === request) that._avatarRequest = null;
        if (!flow || that._avatarFlow !== flow) return;
        flow.finish();
        that._avatarFlow = null;
        if (!that._detached && that.data.active && that.data.show) that.setData({ profileUploading: false });
      });
    },

    onProfileSave() {
      if (this.data.profileUploading || this._avatarFlow) return;
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
