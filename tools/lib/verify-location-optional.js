const data = require('../../miniprogram/utils/data');
const cloud = require('../../miniprogram/utils/cloudRecords');
function test() {
  const mem = {
    id: data.createId(),
    restaurant: 'Test',
    notes: '',
    date: '2026-09-19',
    rating: 0,
    tags: [],
    cuisine: '',
    diningTypes: [],
    perCapita: 0,
    dishes: [],
    ratingSource: 'unrated',
    photo: '/images/le-comptoir.jpg',
    noPhoto: false,
    extraPhotos: [],
    city: '',
    country: '',
    geoConfirmed: false,
    geoSource: 'manual',
    neighborhood: '',
    coordinates: [39.9042, 116.4074],
    address: undefined,
    locationName: undefined,
    locationSource: undefined,
    coordinateSystem: undefined,
    locationUnknown: true,
    shared: false,
    liked: false,
    saved: false,
  };
  if (!data.isMemory(mem)) throw new Error('isMemory should pass for locationUnknown true');
  const rec = cloud.memoryToCloudRecord(mem);
  if (rec.coordinates) throw new Error('coordinates should be deleted when locationUnknown');
  if (rec.locationSource !== undefined) throw new Error('locationSource should be undefined');
  console.log('location optional test PASS');
}
test();
