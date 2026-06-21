class AssetBookingService {
  constructor() {
    this._booked = {
      titles:  {},  // { scheduleId: value }
      descs:   {},
      thumbs:  {},
      videos:  {},  // video-ready path (mode copy)
    };
  }

  book(scheduleId, { title, desc, thumb, video }) {
    if (title) this._booked.titles[scheduleId]  = title;
    if (desc)  this._booked.descs[scheduleId]   = desc;
    if (thumb) this._booked.thumbs[scheduleId]  = thumb;
    if (video) this._booked.videos[scheduleId]  = video;
    console.log(`[AssetBooking] Booked schedule ${scheduleId}:`, { title, thumb, video });
  }

  release(scheduleId) {
    delete this._booked.titles[scheduleId];
    delete this._booked.descs[scheduleId];
    delete this._booked.thumbs[scheduleId];
    delete this._booked.videos[scheduleId];
    console.log(`[AssetBooking] Released schedule ${scheduleId}`);
  }

  getBookedAssets() {
    return {
      titles:  Object.values(this._booked.titles),
      descs:   Object.values(this._booked.descs),
      thumbs:  Object.values(this._booked.thumbs),
      videos:  Object.values(this._booked.videos),
    };
  }
}

module.exports = new AssetBookingService();
