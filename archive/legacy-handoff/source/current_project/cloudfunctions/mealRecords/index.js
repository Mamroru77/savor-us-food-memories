const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const COLLECTION = 'dining_records'

async function ensureCollection() {
  try {
    await db.createCollection(COLLECTION)
  } catch (err) {
    // createCollection throws when the collection already exists; that is safe to ignore.
  }
}

function cleanText(value, maxLength = 200) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function normalizeRecord(input, openid) {
  const ratings = input.ratings || {}
  const dishes = Array.isArray(input.dishes)
    ? input.dishes.map((item) => cleanText(item, 30)).filter(Boolean).slice(0, 20)
    : []
  const photos = Array.isArray(input.photos)
    ? input.photos.map((item) => cleanText(item, 500)).filter(Boolean).slice(0, 9)
    : []

  return {
    restaurantName: cleanText(input.restaurantName, 80),
    date: cleanText(input.date, 20),
    city: cleanText(input.city, 40),
    address: cleanText(input.address, 150),
    cuisine: cleanText(input.cuisine, 30),
    perCapita: Number(input.perCapita) || 0,
    ratings: {
      lajiChong: Math.max(0, Math.min(5, Number(ratings.lajiChong) || 0)),
      xiaoXiaoQi: Math.max(0, Math.min(5, Number(ratings.xiaoXiaoQi) || 0))
    },
    dishes,
    note: cleanText(input.note, 500),
    photos,
    createdBy: openid,
    memberOpenids: [openid],
    coupleId: '',
    createdAt: db.serverDate(),
    updatedAt: db.serverDate()
  }
}

async function addRecord(event, openid) {
  const input = event.data || {}
  const record = normalizeRecord(input, openid)

  if (!record.restaurantName) {
    return { success: false, code: 'RESTAURANT_REQUIRED', message: '请填写餐厅名称' }
  }
  if (!record.date) {
    return { success: false, code: 'DATE_REQUIRED', message: '请选择用餐日期' }
  }

  const result = await db.collection(COLLECTION).add({ data: record })
  return { success: true, id: result._id }
}

async function listRecords(openid) {
  const result = await db
    .collection(COLLECTION)
    .where({ createdBy: openid })
    .orderBy('date', 'desc')
    .limit(50)
    .get()

  return { success: true, data: result.data || [] }
}

exports.main = async (event) => {
  await ensureCollection()

  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action || 'list'

  try {
    if (action === 'add') return await addRecord(event, openid)
    if (action === 'list') return await listRecords(openid)

    return { success: false, code: 'UNKNOWN_ACTION', message: '未知操作' }
  } catch (err) {
    console.error('[mealRecords]', action, err)
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err && err.message ? err.message : '云端处理失败'
    }
  }
}
