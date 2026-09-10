function todayString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Page({
  data: {
    restaurantName: '',
    date: todayString(),
    city: '',
    address: '',
    cuisine: '',
    perCapita: '',
    lajiChongRating: 0,
    xiaoXiaoQiRating: 0,
    scores: [1, 2, 3, 4, 5],
    dishes: [],
    dishInput: '',
    note: '',
    photos: [],
    saving: false
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  handleDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  setRating(e) {
    const who = e.currentTarget.dataset.who
    const score = Number(e.currentTarget.dataset.score)
    if (who === 'lajiChong') {
      this.setData({ lajiChongRating: score })
    } else {
      this.setData({ xiaoXiaoQiRating: score })
    }
  },

  addDish() {
    const value = (this.data.dishInput || '').trim()
    if (!value) return
    if (this.data.dishes.includes(value)) {
      this.setData({ dishInput: '' })
      return
    }
    if (this.data.dishes.length >= 20) {
      wx.showToast({ title: '最多记录 20 道菜', icon: 'none' })
      return
    }
    this.setData({
      dishes: [...this.data.dishes, value],
      dishInput: ''
    })
  },

  removeDish(e) {
    const index = Number(e.currentTarget.dataset.index)
    const dishes = this.data.dishes.filter((_, i) => i !== index)
    this.setData({ dishes })
  },

  choosePhotos() {
    const remain = 9 - this.data.photos.length
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 9 张照片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((item) => item.tempFilePath)
        this.setData({ photos: [...this.data.photos, ...paths].slice(0, 9) })
      }
    })
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.photos })
  },

  removePhoto(e) {
    const index = Number(e.currentTarget.dataset.index)
    const photos = this.data.photos.filter((_, i) => i !== index)
    this.setData({ photos })
  },

  async uploadPhotos() {
    const tasks = this.data.photos.map((tempFilePath, index) => {
      const extMatch = tempFilePath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
      const ext = extMatch ? extMatch[1] : 'jpg'
      const cloudPath = `dining/${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      return wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath })
    })

    const results = await Promise.all(tasks)
    return results.map((item) => item.fileID)
  },

  async saveRecord() {
    if (this.data.saving) return

    const restaurantName = (this.data.restaurantName || '').trim()
    if (!restaurantName) {
      wx.showToast({ title: '先写下餐厅名称吧', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: this.data.photos.length ? '正在保存照片…' : '正在保存…', mask: true })

    try {
      const photoFileIds = this.data.photos.length ? await this.uploadPhotos() : []
      const result = await wx.cloud.callFunction({
        name: 'mealRecords',
        data: {
          action: 'add',
          data: {
            restaurantName,
            date: this.data.date,
            city: this.data.city,
            address: this.data.address,
            cuisine: this.data.cuisine,
            perCapita: this.data.perCapita,
            ratings: {
              lajiChong: this.data.lajiChongRating,
              xiaoXiaoQi: this.data.xiaoXiaoQiRating
            },
            dishes: this.data.dishes,
            note: this.data.note,
            photos: photoFileIds
          }
        }
      })

      const payload = result.result || {}
      if (!payload.success) {
        throw new Error(payload.message || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({ title: '这一顿记下啦 ❤', icon: 'none', duration: 1200 })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (err) {
      console.error('[saveRecord]', err)
      wx.hideLoading()
      const message = (err && err.message) || (err && err.errMsg) || '保存失败，请重试'
      wx.showModal({
        title: '还差一步',
        content: message.includes('mealRecords')
          ? '请先在开发者工具中部署 mealRecords 云函数，然后再保存。'
          : message,
        showCancel: false
      })
    } finally {
      this.setData({ saving: false })
    }
  }
})
