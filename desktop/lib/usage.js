// 하루 AI 호출 한도. store 는 저장되는 객체 (store.days = { 'YYYY-MM-DD': 횟수 }).
class Usage {
  constructor(store, limit) {
    this.store = store;
    this.limit = limit;
  }
  _day(date) {
    if (!this.store.days || !(date in this.store.days)) this.store.days = { [date]: 0 };
    return this.store.days;
  }
  take(date) {
    const days = this._day(date);
    if (days[date] >= this.limit) return false;
    days[date] += 1;
    return true;
  }
  left(date) {
    return Math.max(0, this.limit - this._day(date)[date]);
  }
}

module.exports = { Usage };
