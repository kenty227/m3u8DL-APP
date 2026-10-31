(function (root) {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  function validateSlots(input = []) {
    if (!Array.isArray(input) || input.length > 50) throw new Error('固定时段最多保存 50 组。');
    const slots = input.map(slot => {
      if (!slot || !timePattern.test(slot.startTime) || !timePattern.test(slot.endTime) || typeof slot.endNextDay !== 'boolean') throw new Error('请填写完整的开始、结束时间，并选择结束日期。');
      const start = minutes(slot.startTime), end = minutes(slot.endTime) + (slot.endNextDay ? 1440 : 0);
      if (end <= start || end - start > 1440) throw new Error('结束时间必须晚于开始时间，跨天时请选择次日；每段最多 24 小时。');
      return { startTime:slot.startTime, endTime:slot.endTime, endNextDay:slot.endNextDay };
    }).sort((a,b) => minutes(a.startTime) - minutes(b.startTime));
    for (let i = 1; i < slots.length; i++) {
      const previous = slots[i-1];
      if (minutes(slots[i].startTime) < minutes(previous.endTime) + (previous.endNextDay ? 1440 : 0)) throw new Error('固定时段不能重叠。');
    }
    return slots;
  }
  function expandSlots(input, date) {
    const slots = validateSlots(input);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请选择录制日期。');
    const [year,month,day] = date.split('-').map(Number);
    const base = new Date(year, month-1, day);
    if (base.getFullYear() !== year || base.getMonth() !== month-1 || base.getDate() !== day) throw new Error('录制日期无效。');
    const datetime = (time, offset) => {
      const result = new Date(year, month-1, day + offset, Number(time.slice(0,2)), Number(time.slice(3)));
      if (result.getHours() !== Number(time.slice(0,2)) || result.getMinutes() !== Number(time.slice(3))) throw new Error('所选日期因夏令时跳转不存在此时间，请调整时段。');
      return result.toISOString();
    };
    return slots.map(slot => ({ startAt:datetime(slot.startTime,0), endAt:datetime(slot.endTime,slot.endNextDay ? 1 : 0) }));
  }
  const api = { validateSlots, expandSlots };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.planTimes = api;
})(globalThis);
