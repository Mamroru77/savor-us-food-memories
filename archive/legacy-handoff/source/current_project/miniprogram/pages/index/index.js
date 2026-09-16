Page({
  data: {
    loading: true,
    records: [],
    latestRecord: null,
    stats: {
      restaurantCount: 0,
      cityCount: 0,
      wishlistCount: 0
    }
  },

  onShow() {
    this.loadRecords()
  },

  async loadRecords() {
    this.setData({ loading: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'mealRecords',
        data: { action: 'list' }
      })
      const payload = result.result || {}
      if (!payload.success) throw new Error(payload.message || '读取记录失败')

      const records = payload.data || []
      await this.attachCoverUrls(records)

      const restaurantKeys = new Set()
      const cities = new Set()
      records.forEach((item) => {
        const key = `${item.restaurantName || ''}|${item.address || ''}`
        if (item.restaurantName) restaurantKeys.add(key)
        if (item.city) cities.add(item.city)
      })

      this.setData({
        records,
        latestRecord: records[0] || null,
        stats: {
          restaurantCount: restaurantKeys.size,
          cityCount: cities.size,
          wishlistCount: 0
        },
        loading: false
      })
    } catch (err) {
      console.warn('[loadRecords]', err)
      this.setData({ loading: false })
    }
  },

  async attachCoverUrls(records) {
    const fileIds = []
    records.forEach((record) => {
      if (record.photos && record.photos[0]) fileIds.push(record.photos[0])
    })
    if (!fileIds.length) return

    try {
      const result = await wx.cloud.getTempFileURL({ fileList: fileIds })
      const urlMap = {}
      ;(result.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) urlMap[item.fileID] = item.tempFileURL
      })
      records.forEach((record) => {
        const fileId = record.photos && record.photos[0]
        record.coverUrl = fileId ? (urlMap[fileId] || '') : ''
      })
    } catch (err) {
      console.warn('[cover url]', err)
    }
  },

  addMeal() {
    wx.navigateTo({ url: '/pages/add/index' })
  },

  comingSoon() {
    wx.showToast({
      title: '这个页面马上就做',
      icon: 'none'
    })
  }
})
